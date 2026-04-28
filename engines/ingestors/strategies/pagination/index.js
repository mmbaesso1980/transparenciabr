/**
 * Pagination drivers — yield URL/query mutations per step.
 *
 * Two patterns:
 *   (A) Static (none/page/offset/year/uf/iter_ids/date_window): pure async generator.
 *       Caller can pass `{ isEmpty: true }` via .next(feedback) to break early.
 *   (B) Dynamic (cursor/link_header): generator yields plan → caller awaits HTTP →
 *       caller pushes `{ nextCursor, nextLink, linkHeader, isEmpty }` via .next(feedback).
 *
 * Pagination caps: pag.max_pages || 5000.
 */

const UF_ALL = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

function getPath(obj, path) {
  if (!path) return undefined;
  const parts = path.split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    cur = cur?.[p];
  }
  return cur;
}

/**
 * Parse RFC 5988 Link header. Returns { next, prev, last, first } URLs.
 * @param {string|undefined} linkHeader
 */
export function parseLinkHeader(linkHeader) {
  if (!linkHeader) return {};
  const out = {};
  const parts = String(linkHeader).split(",");
  for (const p of parts) {
    const m = p.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (m) out[m[2]] = m[1];
  }
  return out;
}

/**
 * @param {*} api
 * @param {{ since?: string, checkpoint?: Record<string, unknown>, dryRun?: boolean, idList?: any[] }} ctx
 *
 * Caller protocol for cursor/link_header:
 *   const it = iteratePaginationPlans(api, ctx);
 *   let feedback;
 *   while (true) {
 *     const { value, done } = await it.next(feedback);
 *     if (done) break;
 *     const response = await fetch(value);
 *     feedback = { nextCursor, nextLink, linkHeader, isEmpty };
 *   }
 */
export async function* iteratePaginationPlans(api, ctx = {}) {
  const pag = api.pagination || { type: "none" };
  const maxPages = pag.max_pages ?? 5000;

  switch (pag.type) {
    case "none":
      yield { description: "single request", query: {}, pathReplacements: {} };
      return;

    case "offset": {
      let offset = Number(ctx.checkpoint?.last_offset ?? 0);
      const limit = pag.page_size || 50;
      const lp = pag.limit_param || "limite";
      const op = pag.offset_param || "offset";
      let pageIdx = 0;
      while (pageIdx < maxPages) {
        const fb = yield {
          description: `offset ${offset}`,
          query: { [lp]: limit, [op]: offset },
          pathReplacements: {},
          meta: { pageIdx, offset },
        };
        if (fb?.isEmpty) return;
        offset += limit;
        pageIdx += 1;
      }
      return;
    }

    case "page": {
      let page = pag.start_page ?? 1;
      const pp = pag.page_param || "pagina";
      const per = pag.per_page_param || "tamanhoPagina";
      let count = 0;
      while (count < maxPages) {
        const fb = yield {
          description: `page ${page}`,
          query: { [pp]: page, [per]: pag.page_size || 15 },
          pathReplacements: {},
          meta: { page },
        };
        if (fb?.isEmpty) return;
        page += 1;
        count += 1;
      }
      return;
    }

    case "cursor": {
      let cursor = ctx.checkpoint?.last_cursor || "";
      const cursorParam = pag.cursor_param || "cursor";
      let step = 0;
      while (step < maxPages) {
        const fb = yield {
          description: cursor ? `cursor=${String(cursor).slice(0, 32)}` : "cursor start",
          query: cursor ? { [cursorParam]: cursor } : {},
          pathReplacements: {},
          meta: { cursor, step },
        };
        // If caller doesn't push feedback, break to avoid infinite loop
        if (fb === undefined && step > 0) return;
        if (fb?.isEmpty) return;
        const nextCursor = fb?.nextCursor;
        if (
          nextCursor === undefined ||
          nextCursor === null ||
          nextCursor === "" ||
          nextCursor === cursor
        ) {
          return;
        }
        cursor = nextCursor;
        step += 1;
      }
      return;
    }

    case "link_header": {
      let url = null;
      let step = 0;
      while (step < maxPages) {
        const fb = yield {
          description: url ? `link_header step ${step}` : "link_header start",
          query: {},
          pathReplacements: {},
          overrideUrl: url,
          meta: { step, url },
        };
        if (fb === undefined && step > 0) return;
        if (fb?.isEmpty) return;
        const links = parseLinkHeader(fb?.linkHeader);
        const nextUrl = fb?.nextLink || links.next;
        if (!nextUrl || nextUrl === url) return;
        url = nextUrl;
        step += 1;
      }
      return;
    }

    case "date_window": {
      const granularity = pag.granularity || "single";
      const today = new Date().toISOString().slice(0, 10);
      const startStr =
        ctx.since ||
        ctx.checkpoint?.last_date ||
        new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);

      if (granularity === "single") {
        yield {
          description: `date window ${startStr}..${today}`,
          query: {
            [pag.start_param || "dataInicio"]: startStr,
            [pag.end_param || "dataFim"]: today,
          },
          pathReplacements: {},
        };
        return;
      }

      // daily granularity (used by /agendareuniao/{AAAAMMDD}.json etc.)
      const start = new Date(startStr);
      const end = new Date(today);
      let count = 0;
      for (
        let d = new Date(start);
        d <= end && count < maxPages;
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        const iso = d.toISOString().slice(0, 10);
        const aaaammdd = iso.replace(/-/g, "");
        yield {
          description: `date ${iso}`,
          query: {},
          pathReplacements: {
            AAAAMMDD: aaaammdd,
            YYYYMMDD: aaaammdd,
            ISO: iso,
            data: iso,
          },
          meta: { date: iso },
        };
        count += 1;
      }
      return;
    }

    case "year_loop":
    case "year_zip": {
      const y0 = pag.start_year ?? 2000;
      const y1 = pag.end_year ?? new Date().getFullYear();
      for (let y = y0; y <= y1; y++) {
        yield {
          description: `year ${y}`,
          query: {},
          pathReplacements: { ano: String(y), year: String(y), AAAA: String(y) },
          meta: { year: y },
        };
      }
      return;
    }

    case "uf_loop": {
      for (const uf of UF_ALL) {
        yield {
          description: `uf ${uf}`,
          query: { uf },
          pathReplacements: { UF: uf, uf },
          meta: { uf },
        };
      }
      return;
    }

    case "iter_ids": {
      const ids = ctx.idList || pag.id_list || [];
      if (!ids.length) {
        yield {
          description: "placeholder iter_ids (provide ctx.idList or catalog.id_list)",
          query: {},
          pathReplacements: { codigo: "0", id: "0", cnpj: "00000000000000" },
          meta: { placeholder: true },
        };
        return;
      }
      for (const id of ids) {
        yield {
          description: `id ${id}`,
          query: {},
          pathReplacements: {
            codigo: String(id),
            id: String(id),
            cnpj: String(id).replace(/\D/g, ""),
            ID: String(id),
          },
          meta: { id },
        };
      }
      return;
    }

    case "bigquery_query":
    case "bulk_download":
    case "ftp_dbc":
    case "catalog_scrape":
    case "inlabs_daily":
      yield {
        description: pag.type,
        query: {},
        pathReplacements: {},
        meta: { strategy: pag.type, deferred: true },
      };
      return;

    default:
      yield { description: String(pag.type), query: {}, pathReplacements: {} };
  }
}

export function extractNextCursor(body, cursorField) {
  return getPath(body, cursorField || "meta.next");
}

export { UF_ALL };
