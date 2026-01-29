const { sql } = require("@vercel/postgres");

function json(res, status, body){
  res.statusCode = status;
  res.setHeader("Content-Type","application/json");
  res.end(JSON.stringify(body));
}

function cors(res, origin){
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function ensureSchema(){
  await sql`CREATE TABLE IF NOT EXISTS form_tokens(
    token TEXT PRIMARY KEY,
    guildId TEXT NOT NULL,
    userId TEXT NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    createdAt BIGINT NOT NULL
  );`;

  await sql`CREATE TABLE IF NOT EXISTS form_submissions(
    id SERIAL PRIMARY KEY,
    guildId TEXT NOT NULL,
    userId TEXT NOT NULL,
    discordTag TEXT,
    nick TEXT NOT NULL,
    idade INT NOT NULL,
    motivo TEXT NOT NULL,
    linkBonde TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    createdAt BIGINT NOT NULL,
    logged BOOLEAN NOT NULL DEFAULT FALSE
  );`;
}

function randToken(){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out="";
  for(let i=0;i<24;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}

function requireAuth(req){
  const key = process.env.ADMIN_API_KEY;
  if (!key) return { ok:false, error:"ADMIN_API_KEY não configurada na Vercel" };
  const auth = req.headers.authorization || "";
  const got = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (got !== key) return { ok:false, error:"Unauthorized" };
  return { ok:true };
}

async function readBody(req){
  return await new Promise((resolve) => {
    let data="";
    req.on("data", (c)=> data+=c);
    req.on("end", ()=>{
      try{ resolve(JSON.parse(data||"{}")); }catch{ resolve({}); }
    });
  });
}

module.exports = async (req, res) => {
  const allowed = process.env.ALLOWED_ORIGINS || "*";
  cors(res, allowed);

  if (req.method === "OPTIONS") return res.end("");
  if (req.method !== "POST") return json(res, 405, { error:"Use POST" });

  const auth = requireAuth(req);
  if (!auth.ok) return json(res, 401, { error: auth.error });

  try{
    await ensureSchema();
    const body = await readBody(req);
    const action = body.action;

    if (action === "createToken"){
      const guildId = String(body.guildId||"").trim();
      const userId = String(body.userId||"").trim();
      if(!guildId || !userId) return json(res, 400, { error:"guildId/userId obrigatórios" });
      const token = randToken();
      await sql`INSERT INTO form_tokens(token,guildId,userId,used,createdAt) VALUES(${token},${guildId},${userId},FALSE,${Date.now()})`;
      return json(res, 200, { ok:true, token });
    }

    if (action === "submit"){
      // chamado pelo site/form
      const token = String(body.token||"").trim();
      const discordTag = String(body.discordTag||"").trim() || null;
      const nick = String(body.nick||"").trim();
      const idade = Number(body.idade);
      const motivo = String(body.motivo||"").trim();
      const linkBonde = String(body.linkBonde||"").trim();

      if(!token || !nick || !Number.isFinite(idade) || !motivo || !linkBonde) {
        return json(res, 400, { error:"Campos inválidos" });
      }

      const t = await sql`SELECT token, guildId, userId, used FROM form_tokens WHERE token=${token}`;
      if(!t.rows.length) return json(res, 404, { error:"Token inválido" });
      if(t.rows[0].used) return json(res, 410, { error:"Token já usado" });

      await sql`UPDATE form_tokens SET used=TRUE WHERE token=${token}`;

      const guildId = t.rows[0].guildid || t.rows[0].guildId;
      const userId = t.rows[0].userid || t.rows[0].userId;

      const ins = await sql`
        INSERT INTO form_submissions(guildId,userId,discordTag,nick,idade,motivo,linkBonde,status,createdAt,logged)
        VALUES(${guildId},${userId},${discordTag},${nick},${idade},${motivo},${linkBonde},'pending',${Date.now()},FALSE)
        RETURNING id;
      `;
      return json(res, 200, { ok:true, id: ins.rows[0].id });
    }

    if (action === "list"){
      const status = String(body.status||"pending");
      const q = await sql`SELECT * FROM form_submissions WHERE status=${status} ORDER BY id DESC LIMIT 100`;
      return json(res, 200, { ok:true, items: q.rows });
    }

    if (action === "decide"){
      const id = Number(body.id);
      const decision = String(body.decision||"").trim();
      if(!Number.isFinite(id) || !["approved","rejected"].includes(decision)) return json(res, 400, { error:"id/decision inválidos" });
      await sql`UPDATE form_submissions SET status=${decision} WHERE id=${id}`;
      return json(res, 200, { ok:true });
    }

    // BOT: pega pendentes ainda não logados
    if (action === "pollForLogs"){
      const guildId = String(body.guildId||"").trim();
      if(!guildId) return json(res, 400, { error:"guildId obrigatório" });
      const q = await sql`
        SELECT * FROM form_submissions
        WHERE guildId=${guildId} AND status='pending' AND logged=FALSE
        ORDER BY id ASC
        LIMIT 10;
      `;
      return json(res, 200, { ok:true, items: q.rows });
    }

    if (action === "markLogged"){
      const id = Number(body.id);
      if(!Number.isFinite(id)) return json(res, 400, { error:"id inválido" });
      await sql`UPDATE form_submissions SET logged=TRUE WHERE id=${id}`;
      return json(res, 200, { ok:true });
    }

    return json(res, 400, { error:"Ação desconhecida" });
  }catch(e){
    return json(res, 500, { error: e.message || "Erro interno" });
  }
};
