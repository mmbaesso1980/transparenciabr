(function () {
  function logLine(s) {
    var el = document.getElementById("log");
    el.textContent += (el.textContent ? "\n" : "") + s;
    el.scrollTop = el.scrollHeight;
  }

  function adapterBase() {
    var v = (document.getElementById("adapter").value || "").trim().replace(/\/+$/, "");
    if (v) return v;
    try {
      return (localStorage.getItem("aurora_adapter_base") || "").trim().replace(/\/+$/, "");
    } catch (e) {
      return "";
    }
  }

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

  function runHealth() {
    return req("GET", "/health")
      .then(function (x) {
        logLine("health " + x.status + " " + x.t.slice(0, 800));
      })
      .catch(function (e) {
        logLine("health erro: " + (e.message || e));
      });
  }

  function runAgents() {
    return req("GET", "/v1/agents")
      .then(function (x) {
        logLine("agents " + x.status + " " + x.t.slice(0, 2000));
      })
      .catch(function (e) {
        logLine("agents erro: " + (e.message || e));
      });
  }

  function boot() {
    var param = new URLSearchParams(location.search).get("adapter");
    if (param) {
      try {
        var u = decodeURIComponent(param).trim().replace(/\/+$/, "");
        new URL(u);
        localStorage.setItem("aurora_adapter_base", u);
      } catch (e) {
        logLine("Query ?adapter= inválida, ignorada.");
      }
    }
    document.getElementById("adapter").value = localStorage.getItem("aurora_adapter_base") || "";

    document.getElementById("btn-save-adapter").onclick = function () {
      var b = (document.getElementById("adapter").value || "").trim().replace(/\/+$/, "");
      if (!b) {
        localStorage.removeItem("aurora_adapter_base");
        logLine("Adapter URL limpa.");
        return;
      }
      try {
        new URL(b);
      } catch (e) {
        logLine("URL inválida.");
        return;
      }
      localStorage.setItem("aurora_adapter_base", b);
      logLine("Adapter guardado: " + b);
    };

    document.getElementById("btn-health").onclick = function () {
      runHealth();
    };
    document.getElementById("btn-agents").onclick = function () {
      runAgents();
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
          logLine("responses erro: " + (e.message || e));
        });
    };

    logLine("— Sala de Guerra (auth desativada) —");
    var base = adapterBase();
    if (!base) {
      logLine("Sem URL do adapter: preencha o campo, Guarde, ou use ?adapter=… e recarregue.");
      return;
    }
    logLine("[arranque] GET /health …");
    runHealth().then(function () {
      logLine("[arranque] GET /v1/agents …");
      return runAgents();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
