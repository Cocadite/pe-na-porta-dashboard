let forms = [];
export default async function handler(req,res){
  if(req.method==='POST'){
    forms.push(req.body);
    return res.json({ ok:true });
  }
  res.json({ forms });
}
