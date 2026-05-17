(function () {
  var ALLOWED_EMAIL = "manusalt13@gmail.com";

  function showBootErr(msg) {
    var el = document.getElementById("boot-err");
    el.style.display = "block";
    el.textContent = msg;
  }
  function logLine(s) {
    var el = document.getElementById("log");
    el.textContent += (el.textContent ? "\n" : "") + s;
    el.scrollTop = el.scrollHeight;
  }

  function adapterBase() {
    var v = (document.getElementById("adapter").value || "").trim().replace(/\/+$/, "");
    if (v) return v;
    try {
      return (localStorage.getItem("asmodeus_adapter_base") || "").trim().replace(/\/+$/, "");
    } catch (e) {
      return "";
    }
  }

  fetch("/__/firebase/init.json")
    .then(function (r) {
      if (!r.ok)
        throw new Error(
          "init.json " + r.status + " — faça deploy no Firebase Hosting (projeto transparenciabr) ou use emulador.",
        );
      return r.json();
    })
    .then(function (cfg) {
      if (!cfg || !cfg.apiKey) throw new Error("Config Firebase vazio.");
      firebase.initializeApp(cfg);
      var auth = firebase.auth();

      document.getElementById("adapter").value = localStorage.getItem("asmodeus_adapter_base") || "";

      function showApp(user) {
        document.getElementById("gate").classList.remove("active");
        document.getElementById("app").classList.add("active");
        logLine("Sessão: " + user.email);
      }
      function showGate() {
        document.getElementById("app").classList.remove("active");
        document.getElementById("gate").classList.add("active");
      }

      auth.onAuthStateChanged(function (user) {
        if (!user) {
          showGate();
          return;
        }
        if ((user.email || "").toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
          auth.signOut();
          document.getElementById("gate-msg").textContent = "Acesso negado para " + (user.email || "(sem email)") + ".";
          return;
        }
        document.getElementById("gate-msg").textContent = "";
        showApp(user);
      });

      document.getElementById("btn-google").onclick = function () {
        document.getElementById("gate-msg").textContent = "";
        var p = new firebase.auth.GoogleAuthProvider();
        p.setCustomParameters({ prompt: "select_account" });
        auth.signInWithPopup(p).catch(function (e) {
          document.getElementById("gate-msg").textContent = e.message || String(e);
        });
      };

      document.getElementById("btn-out").onclick = function () {
        auth.signOut();
      };

      document.getElementById("btn-save-adapter").onclick = function () {
        var b = (document.getElementById("adapter").value || "").trim().replace(/\/+$/, "");
        if (!b) {
          localStorage.removeItem("asmodeus_adapter_base");
          logLine("Adapter URL limpa.");
          return;
        }
        try {
          new URL(b);
        } catch (e) {
          logLine("URL inválida.");
          return;
        }
        localStorage.setItem("asmodeus_adapter_base", b);
        logLine("Adapter guardado: " + b);
      };

      function req(method, path) {
        var base = adapterBase();
        if (!base) {
          logLine("Defina a URL do adapter primeiro.");
          return Promise.reject(new Error("no adapter"));
        }
        return fetch(base + path, { method: method, mode: "cors" }).then(function (r) {
          return r.text().then(function (t) {
            return { ok: r.ok, status: r.status, t: t };
          });
        });
      }

      document.getElementById("btn-health").onclick = function () {
        req("GET", "/health")
          .then(function (x) {
            logLine("health " + x.status + " " + x.t.slice(0, 800));
          })
          .catch(function (e) {
            logLine("erro: " + (e.message || e));
          });
      };
      document.getElementById("btn-agents").onclick = function () {
        req("GET", "/v1/agents")
          .then(function (x) {
            logLine("agents " + x.status + " " + x.t.slice(0, 2000));
          })
          .catch(function (e) {
            logLine("erro: " + (e.message || e));
          });
      };

      document.getElementById("btn-send").onclick = function () {
        var base = adapterBase();
        var text = (document.getElementById("prompt").value || "").trim();
        if (!base || !text) {
          logLine("Adapter e texto são obrigatórios.");
          return;
        }
        var body = {
          model: "gemini/gemini-2.5-flash",
          input: [{ role: "user", content: [{ type: "input_text", text: text }] }],
        };
        fetch(base + "/v1/responses", {
          method: "POST",
          mode: "cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
          .then(function (r) {
            return r.text().then(function (t) {
              logLine("responses " + r.status + " " + t.slice(0, 4000));
            });
          })
          .catch(function (e) {
            logLine("erro: " + (e.message || e));
          });
      };
    })
    .catch(function (e) {
      showBootErr(e.message || String(e));
    });
})();
