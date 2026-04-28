/**
 * Pagination drivers yield URL/query mutations per step.
 */

const UF_ALL = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
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
 * @param {*} api
 * @param {{ since?: string, checkpoint?: Record<string, unknown>, dryRun?: boolean }} ctx
 */
export async function* iteratePaginationPlans(api, ctx = {}) {
  const pag = api.pagination || { type: "none" };
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
      while (pageIdx < 5000) {
        yield {
          description: `offset ${offset}`,
          query: { [lp]: limit, [op]: offset },
          pathReplacements: {},
          meta: { pageIdx, offset },
        };
        offset += limit;
        pageIdx += 1;
      }
      return;
    }

    case "page": {
      let page = pag.start_page ?? 1;
      const pp = pag.page_param || "pagina";
      const per = pag.per_page_param || "tamanhoPagina";
      while (page < 10000) {
        yield {
          description: `page ${page}`,
          query: { [pp]: page, [per]: pag.page_size || 15 },
          pathReplacements: {},
          meta: { page },
        };
        page += 1;
      }
      return;
    }

    case "cursor": {
      let cursor = ctx.checkpoint?.last_cursor || "";
      let step = 0;
      while (step < 5000) {
        yield {
          description: `cursor step ${step}`,
          query: cursor ? { [pag.cursor_param || "cursor"]: cursor } : {},
          pathReplacements: {},
          meta: { cursor },
        };
        step += 1;
      }
      return;
    }

    case "date_window": {
      const start = ctx.since || ctx.checkpoint?.last_date || new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
      yield {
        description: `date window from ${start}`,
        query: {
          [pag.start_param || "dataInicio"]: start,
          [pag.end_param || "dataFim"]: new Date().toISOString().slice(0, 10),
        },
        pathReplacements: {},
      };
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
          pathReplacements: { ano: String(y), year: String(y) },
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
      const ids = ctx.idList || [];
      if (!ids.length) {
        yield {
          description: "placeholder iter_ids (provide checkpoint id_list)",
          query: {},
          pathReplacements: { codigo: "0", id: "0", cnpj: "00000000000000" },
        };
        return;
      }
      for (const id of ids) {
        yield {
          description: `id ${id}`,
          query: {},
          pathReplacements: { codigo: String(id), id: String(id), cnpj: String(id).replace(/\D/g, "") },
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
      yield { description: pag.type, query: {}, pathReplacements: {}, meta: { strategy: pag.type } };
      return;

    default:
      yield { description: String(pag.type), query: {}, pathReplacements: {} };
  }
}

export function extractNextCursor(body, cursorField) {
  return getPath(body, cursorField || "meta.next");
}

export { UF_ALL };
