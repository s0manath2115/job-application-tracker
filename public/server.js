const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
const STATUSES = ["Applied", "Interview", "Offer", "Rejected"];

// Data layer: reads and writes the JSON file. Swap this for MySQL or MongoDB later.
const load = () => { try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch { return []; } };
const save = list => fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));

function validate(b) {
  const errors = [];
  if (!b.company || !String(b.company).trim()) errors.push("company is required");
  if (!b.role || !String(b.role).trim()) errors.push("role is required");
  if (b.status && !STATUSES.includes(b.status)) errors.push("status must be one of: " + STATUSES.join(", "));
  return errors;
}

function clean(b) {
  return {
    company: String(b.company).trim().slice(0, 80),
    role: String(b.role).trim().slice(0, 80),
    status: b.status || "Applied",
    link: String(b.link || "").trim().slice(0, 300),
    notes: String(b.notes || "").trim().slice(0, 500),
  };
}

const send = (res, code, obj) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", c => { raw += c; if (raw.length > 1e6) { reject(new Error("too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("invalid JSON")); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const match = url.pathname.match(/^\/api\/applications(?:\/(\d+))?$/);

  if (!match) {
    if (url.pathname === "/" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(path.join(__dirname, "public", "index.html")));
    }
    return send(res, 404, { error: "not found" });
  }

  const id = match[1] ? Number(match[1]) : null;
  try {
    let list = load();
    if (req.method === "GET" && !id) return send(res, 200, list);

    if (req.method === "POST" && !id) {
      const body = await readBody(req);
      const errors = validate(body);
      if (errors.length) return send(res, 400, { errors });
      const item = { id: Date.now(), ...clean(body), createdAt: new Date().toISOString() };
      list.push(item); save(list);
      return send(res, 201, item);
    }

    if (req.method === "PUT" && id) {
      const i = list.findIndex(x => x.id === id);
      if (i < 0) return send(res, 404, { error: "application not found" });
      const body = await readBody(req);
      const merged = { ...list[i], ...body };
      const errors = validate(merged);
      if (errors.length) return send(res, 400, { errors });
      list[i] = { ...list[i], ...clean(merged) };
      save(list);
      return send(res, 200, list[i]);
    }

    if (req.method === "DELETE" && id) {
      if (!list.some(x => x.id === id)) return send(res, 404, { error: "application not found" });
      save(list.filter(x => x.id !== id));
      return send(res, 200, { deleted: id });
    }

    return send(res, 405, { error: "method not allowed" });
  } catch (e) {
    return send(res, 400, { error: e.message });
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log("Running at http://localhost:" + PORT));
}
module.exports = server;
