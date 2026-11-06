import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Kind = "Raw material" | "Refined material" | "Component" | "Finished product";
type Ingredient = { resourceId: string; quantity: number };
type Resource = {
  id: string; name: string; category: string; kind: Kind; description: string;
  factory: string; ingredients: Ingredient[]; location: string; supplier: string;
  owner: string; acquisition: string; notes: string; x?: number; y?: number;
};
const FACTORIES = ["Raw and Refined Materials","Alloy Factory","Component Factory","Weapons Factory","Droid Factory","Speeder Factory","Ship Factory","Equipment Factory","Foodstuffs Factory"];
const SEED: Resource[] = [
  {id:"raw-ore",name:"Example: Ore",category:"Raw and Refined Materials",kind:"Raw material",description:"Replace this example with a real raw material from your production chart.",factory:"Raw and Refined Materials",ingredients:[],location:"Information not yet added",supplier:"Information not yet added",owner:"Information not yet added",acquisition:"Information not yet added",notes:"Example entry — edit or delete it."},
  {id:"refined-metal",name:"Example: Refined Metal",category:"Raw and Refined Materials",kind:"Refined material",description:"An example refined material.",factory:"Raw and Refined Materials",ingredients:[{resourceId:"raw-ore",quantity:2}],location:"",supplier:"",owner:"",acquisition:"",notes:"Example entry — edit or delete it."},
  {id:"alloy",name:"Example: Alloy Plate",category:"Alloy Factory",kind:"Component",description:"An example manufactured component.",factory:"Alloy Factory",ingredients:[{resourceId:"refined-metal",quantity:3}],location:"",supplier:"",owner:"",acquisition:"",notes:"Example entry — edit or delete it."}
];
const STORAGE = "galactic-production-atlas-v1";
const uid = () => "r-" + Math.random().toString(36).slice(2,10);
const blank = (): Resource => ({id:uid(),name:"New resource",category:FACTORIES[0],kind:"Raw material",description:"",factory:FACTORIES[0],ingredients:[],location:"",supplier:"",owner:"",acquisition:"",notes:""});
const safeText = (v: string) => v.trim();

export default function App() {
  const [resources,setResources] = useState<Resource[]>(() => {
    try { const v=localStorage.getItem(STORAGE); return v ? JSON.parse(v) : SEED; } catch { return SEED; }
  });
  const [selected,setSelected] = useState<string|null>(null);
  const [query,setQuery] = useState("");
  const [panel,setPanel] = useState<"details"|"admin"|"chain">("details");
  const [editing,setEditing] = useState<Resource|null>(null);
  const [admin,setAdmin] = useState(false);
  const [notice,setNotice] = useState("");
  const [scale,setScale] = useState(1);
  const [offset,setOffset] = useState({x:0,y:0});
  const [mapSize,setMapSize] = useState({w:1425,h:978});
  const [mapReady,setMapReady] = useState(false);
  const [dragging,setDragging] = useState(false);
  const [addHotspot,setAddHotspot] = useState(false);
  const [chainRoot,setChainRoot] = useState<string|null>(null);
  const viewport=useRef<HTMLDivElement>(null);
  const img=useRef<HTMLImageElement>(null);
  const drag=useRef<{x:number;y:number;ox:number;oy:number}|null>(null);

  useEffect(()=>{ localStorage.setItem(STORAGE,JSON.stringify(resources)); },[resources]);
  useEffect(()=>{ const t=setTimeout(()=>setNotice(""),3200); return ()=>clearTimeout(t); },[notice]);
  const current=resources.find(r=>r.id===selected)||null;
  const results=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q) return [];
    return resources.filter(r=>[r.name,r.category,r.factory,r.kind,...r.ingredients.map(i=>resources.find(x=>x.id===i.resourceId)?.name||"")].join(" ").toLowerCase().includes(q)).slice(0,12);
  },[query,resources]);

  const fit=useCallback(()=>{
    if(!viewport.current||!img.current) return;
    const rect=viewport.current.getBoundingClientRect();
    const w=img.current.naturalWidth||1425, h=img.current.naturalHeight||978;
    const s=Math.min((rect.width-60)/w,(rect.height-60)/h,1);
    setMapSize({w,h}); setScale(s); setOffset({x:(rect.width-w*s)/2,y:(rect.height-h*s)/2});
  },[]);
  useEffect(()=>{ if(mapReady) fit(); },[mapReady,fit]);
  useEffect(()=>{ const onResize=()=>fit(); window.addEventListener("resize",onResize); return ()=>window.removeEventListener("resize",onResize); },[fit,mapReady]);

  const focusResource=(r:Resource)=>{
    setSelected(r.id); setPanel("details"); setQuery("");
    if(typeof r.x==="number" && typeof r.y==="number" && viewport.current){
      const rect=viewport.current.getBoundingClientRect();
      const target=Math.max(scale,Math.min(2.2,Math.max(.75,scale*1.8)));
      setScale(target);
      setOffset({x:rect.width/2-r.x*target,y:rect.height/2-r.y*target});
    }
  };
  const wheel=(e:React.WheelEvent)=>{
    e.preventDefault();
    const rect=viewport.current!.getBoundingClientRect();
    const px=e.clientX-rect.left, py=e.clientY-rect.top;
    const next=Math.max(.18,Math.min(5,scale*(e.deltaY<0?1.12:.89)));
    const ratio=next/scale;
    setOffset({x:px-(px-offset.x)*ratio,y:py-(py-offset.y)*ratio}); setScale(next);
  };
  const onPointerDown=(e:React.PointerEvent)=>{
    if(e.button!==2) return;
    e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current={x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y}; setDragging(true);
  };
  const onPointerMove=(e:React.PointerEvent)=>{
    if(!drag.current)return;
    setOffset({x:drag.current.ox+e.clientX-drag.current.x,y:drag.current.oy+e.clientY-drag.current.y});
  };
  const onPointerUp=()=>{drag.current=null;setDragging(false);};
  const mapClick=(e:React.MouseEvent)=>{
    if(!addHotspot||!admin||!viewport.current)return;
    const rect=viewport.current.getBoundingClientRect();
    const x=(e.clientX-rect.left-offset.x)/scale, y=(e.clientY-rect.top-offset.y)/scale;
    const r=selected?resources.find(v=>v.id===selected):null;
    if(!r){setNotice("Select a resource first, then click the map to place its hotspot.");return;}
    setResources(prev=>prev.map(v=>v.id===r.id?{...v,x,y}:v));
    setAddHotspot(false);setNotice(`Hotspot placed for ${r.name}`);
  };
  const saveResource=(r:Resource)=>{
    setResources(prev=>prev.some(x=>x.id===r.id)?prev.map(x=>x.id===r.id?r:x):[...prev,r]);
    setSelected(r.id);setEditing(null);setPanel("details");setNotice("Resource saved.");
  };
  const removeResource=(id:string)=>{
    if(!confirm("Delete this resource? Recipes that use it will have that ingredient removed."))return;
    setResources(prev=>prev.filter(r=>r.id!==id).map(r=>({...r,ingredients:r.ingredients.filter(i=>i.resourceId!==id)})));
    setSelected(null);setEditing(null);setNotice("Resource deleted.");
  };
  const exportData=()=>{
    const blob=new Blob([JSON.stringify({version:1,resources},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="production-atlas-data.json";a.click();URL.revokeObjectURL(url);
  };
  const importData=(file:File)=>{
    const reader=new FileReader();reader.onload=()=>{try{const parsed=JSON.parse(String(reader.result));const list=Array.isArray(parsed)?parsed:parsed.resources;if(!Array.isArray(list))throw new Error("No resources array");setResources(list);setSelected(null);setNotice(`Imported ${list.length} resources.`);}catch{setNotice("Could not import that JSON file. Check its format.");}};reader.readAsText(file);
  };
  const chain=(id:string,seen=new Set<string>()):any=>{
    if(seen.has(id)) return {cycle:true,id};
    const resource=resources.find(r=>r.id===id);
    if(!resource) return {missing:true,id};

    const nextSeen=new Set(seen);
    nextSeen.add(id);
    return {
      resource,
      children:resource.ingredients.map(ingredient=>({
        quantity:ingredient.quantity,
        ...chain(ingredient.resourceId,nextSeen)
      }))
    };
  };

  const renderChain=(node:any):React.ReactNode=>{
    if(!node||node.missing) return <span className="muted">Missing resource</span>;
    if(node.cycle) return <span className="cycle">Circular dependency detected</span>;

    const r=node.resource as Resource;
    return (
      <div className="chain-node" key={r.id}>
        <div className="chain-card">
          <strong>{r.name}</strong>
          <span>{r.kind} · {r.factory}{typeof node.quantity==="number"?` · Quantity: ${node.quantity}`:""}</span>
        </div>
        {node.children?.length>0&&(
          <div className="chain-children">
            {node.children.map((child:any,i:number)=>(
              <div key={`${r.id}-${i}`}>{renderChain(child)}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">✦</div>
          <div>
            <div className="brand-title">GALACTIC PRODUCTION ATLAS</div>
            <div className="brand-subtitle">MANUFACTURING & RESOURCE NETWORK</div>
          </div>
        </div>
        <div className="search-area">
          <input
            type="search"
            value={query}
            onChange={e=>setQuery(e.target.value)}
            placeholder="Search resources, materials, factories..."
            aria-label="Search resources"
          />
    {query&&<div className="search-results">{results.length?results.map(r=><button key={r.id} onClick={()=>focusResource(r)}><span>{r.name}</span><small>{r.factory} · {r.kind}</small></button>):<div className="no-results">No matching resources</div>}</div>}
      </div>
      <div className="top-actions"><button className="quiet-btn" onClick={()=>fit()}>Fit map</button><button className="quiet-btn" onClick={()=>{setScale(1);setOffset({x:0,y:0});}}>Reset</button><button className={`admin-btn ${admin?"active":""}`} onClick={()=>{setAdmin(!admin);setPanel("admin");}}>{admin?"Admin mode on":"Admin tools"}</button></div>
    </header>
    <main className="workspace">
      <aside className="factory-rail"><div className="rail-label">DIRECTORY</div>{FACTORIES.map((f,i)=><button key={f} className="factory-btn" onClick={()=>{const r=resources.find(x=>x.factory===f);if(r)focusResource(r);else setNotice("No resources have been assigned to this factory yet.");}}><span className="factory-index">{String(i+1).padStart(2,"0")}</span><span>{f}</span></button>)}<div className="rail-bottom"><div className="status-dot"/> LOCAL DATABASE<br/><small>{resources.length} entries</small></div></aside>
      <section className="map-section">
        <div className="map-toolbar"><div><span className="eyebrow">OVERVIEW / PRODUCTION NETWORK</span><div className="map-heading">Manufacturing blueprint</div></div><div className="map-tools"><span className="zoom-readout">{Math.round(scale*100)}%</span><button onClick={()=>setScale(s=>Math.min(5,s*1.2))}>＋</button><button onClick={()=>setScale(s=>Math.max(.18,s/1.2))}>−</button>{admin&&<button className={addHotspot?"tool-active":""} onClick={()=>{if(!selected){setNotice("Select a resource in the directory or details panel first.");return;}setAddHotspot(!addHotspot);}}>＋ Hotspot</button>}</div></div>
        {addHotspot&&<div className="map-instruction">HOTSPOT PLACEMENT: click the center of the selected resource on the blueprint. <button onClick={()=>setAddHotspot(false)}>Cancel</button></div>}
        <div className={`map-viewport ${dragging?"is-dragging":""} ${addHotspot?"placing":""}`} ref={viewport} onWheel={wheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onContextMenu={e=>e.preventDefault()} onClick={mapClick}>
          <div className="map-canvas" style={{transform:`translate(${offset.x}px,${offset.y}px) scale(${scale})`,width:mapSize.w,height:mapSize.h}}>
            <img ref={img} src="/production-map.png" alt="Manufacturing production flowchart" draggable={false} onLoad={()=>{setMapSize({w:img.current!.naturalWidth,h:img.current!.naturalHeight});setMapReady(true);}}/>
            {resources.filter(r=>typeof r.x==="number"&&typeof r.y==="number").map(r=><button key={r.id} title={r.name} className={`hotspot ${selected===r.id?"selected":""}`} style={{left:r.x,top:r.y}} onClick={e=>{e.stopPropagation();focusResource(r);}}><span/></button>)}
          </div>
          <div className="map-hint">RIGHT-CLICK + DRAG TO PAN&nbsp;&nbsp; · &nbsp;&nbsp;SCROLL TO ZOOM&nbsp;&nbsp; · &nbsp;&nbsp;SELECT A HOTSPOT TO INSPECT</div>
        </div>
        <div className="map-footer"><span>MAP SOURCE: USER-SUPPLIED BLUEPRINT</span><span>{resources.filter(r=>typeof r.x==="number").length} / {resources.length} HOTSPOTS PLACED</span></div>
      </section>
      <aside className="info-panel">
        <div className="panel-tabs"><button className={panel==="details"?"active":""} onClick={()=>setPanel("details")}>INSPECT</button><button className={panel==="chain"?"active":""} onClick={()=>{setChainRoot(selected);setPanel("chain");}}>PRODUCTION CHAIN</button>{admin&&<button className={panel==="admin"?"active":""} onClick={()=>setPanel("admin")}>DATABASE</button>}</div>
        {panel==="details"&&<>{current?<div className="resource-details">
          <div className="eyebrow">{current.category}</div><h1>{current.name}</h1><div className="tag-row"><span className="tag">{current.kind}</span><span className="tag subtle">{current.factory}</span></div>
          <p className="description">{current.description||"No description has been added."}</p>
          <div className="section-title">PRODUCTION RECIPE</div>
          {current.ingredients.length?<div className="ingredient-list">{current.ingredients.map((ing,i)=>{const r=resources.find(x=>x.id===ing.resourceId);return <div className="ingredient" key={i}><span className="qty">×{ing.quantity}</span><button onClick={()=>r&&focusResource(r)}>{r?.name||"Missing resource"}</button><small>{r?.kind||"Unknown"}</small></div>;})}</div>:<div className="empty-note">{current.kind==="Raw material"?"Raw material — no manufacturing recipe.":"No ingredients have been added yet."}</div>}
          {current.kind==="Raw material"&&<><div className="section-title">SOURCE & OWNERSHIP</div><Info label="LOCATION / PLANET" value={current.location}/><Info label="SUPPLIER / ORGANIZATION" value={current.supplier}/><Info label="OWNER / CONTROLLING GROUP" value={current.owner}/><Info label="ACQUISITION METHOD" value={current.acquisition}/></>}
          {current.notes&&<><div className="section-title">ADDITIONAL NOTES</div><p className="notes">{current.notes}</p></>}
          <div className="detail-actions"><button onClick={()=>{setChainRoot(current.id);setPanel("chain");}}>View full chain ↗</button>{admin&&<button onClick={()=>setEditing({...current})}>Edit resource</button>}</div>
        </div>:<div className="empty-state"><div className="empty-symbol">⌖</div><h2>Select a resource</h2><p>Search for an item or select a marked location on the manufacturing blueprint to inspect its recipe, materials, and source information.</p></div>}</>}
        {panel==="chain"&&<div className="chain-panel"><div className="eyebrow">DEPENDENCY EXPLORER</div><h2>Production chain</h2>{chainRoot&&resources.some(r=>r.id===chainRoot)?renderChain(chain(chainRoot)): <p className="muted">Select a resource first to view its full dependency tree.</p>}</div>}
        {panel==="admin"&&<div className="admin-panel">{admin?<><div className="eyebrow">DATABASE MANAGEMENT</div><h2>Resource database</h2><p className="muted">Manage recipes, raw-material sources, ownership, and map hotspots.</p><button className="primary full" onClick={()=>setEditing(blank())}>＋ Add resource</button><div className="admin-actions"><button onClick={exportData}>Export JSON</button><label className="file-button">Import JSON<input type="file" accept=".json,application/json" onChange={e=>e.target.files?.[0]&&importData(e.target.files[0])}/></label></div><div className="section-title">ALL RESOURCES ({resources.length})</div><div className="resource-list">{resources.map(r=><div className="resource-row" key={r.id}><button onClick={()=>focusResource(r)}>{r.name}<small>{r.factory}</small></button><button className="edit-mini" onClick={()=>setEditing({...r})}>EDIT</button></div>)}</div><div className="warning">Admin mode is a convenience toggle, not secure authentication. This local-first version stores data in this browser. Export backups regularly.</div></>:<><h2>Admin tools are off</h2><p className="muted">Turn on Admin tools to edit the database and place map hotspots.</p><button className="primary" onClick={()=>setAdmin(true)}>Enable admin mode</button></>}</div>}
      </aside>
    </main>
    {editing&&<Editor resource={editing} resources={resources} onSave={saveResource} onDelete={()=>removeResource(editing.id)} onClose={()=>setEditing(null)}/>}
    {notice&&<div className="toast">{notice}</div>}
    <footer className="app-footer">GALACTIC PRODUCTION ATLAS <span>LOCAL-FIRST DATABASE · EXPORT JSON FOR BACKUP</span></footer>
  </div>
  );
}
function Info({label,value}:{label:string;value:string}){return <div className="info-row"><small>{label}</small><span>{safeText(value||"Information not yet added")||"Information not yet added"}</span></div>;}
function Editor({resource,resources,onSave,onDelete,onClose}:{resource:Resource;resources:Resource[];onSave:(r:Resource)=>void;onDelete:()=>void;onClose:()=>void}){
  const [form,setForm]=useState<Resource>(resource);
  const patch=(key:keyof Resource,value:any)=>setForm(p=>({...p,[key]:value}));
  const addIngredient=()=>patch("ingredients",[...form.ingredients,{resourceId:resources.find(r=>r.id!==form.id)?.id||"",quantity:1}]);
  const updateIngredient=(index:number,key:"resourceId"|"quantity",value:any)=>patch("ingredients",form.ingredients.map((x,i)=>i===index?{...x,[key]:value}:x));
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="editor-modal"><div className="modal-head"><div><div className="eyebrow">DATABASE EDITOR</div><h2>{resources.some(r=>r.id===form.id)?"Edit resource":"New resource"}</h2></div><button className="close-btn" onClick={onClose}>×</button></div><div className="form-grid">
    <label className="wide">Resource name<input value={form.name} onChange={e=>patch("name",e.target.value)} placeholder="e.g. Durasteel plate"/></label>
    <label>Category<select value={form.category} onChange={e=>patch("category",e.target.value)}>{FACTORIES.map(f=><option key={f}>{f}</option>)}</select></label>
    <label>Type<select value={form.kind} onChange={e=>patch("kind",e.target.value)}>{["Raw material","Refined material","Component","Finished product"].map(k=><option key={k}>{k}</option>)}</select></label>
    <label className="wide">Description<textarea value={form.description} onChange={e=>patch("description",e.target.value)} rows={2}/></label>
    <label className="wide">Producing factory<select value={form.factory} onChange={e=>patch("factory",e.target.value)}>{FACTORIES.map(f=><option key={f}>{f}</option>)}</select></label>
    <div className="wide form-section">RECIPE INGREDIENTS <button type="button" onClick={addIngredient}>＋ Add ingredient</button></div>
    {form.ingredients.map((ing,i)=><div className="ingredient-edit wide" key={i}><select value={ing.resourceId} onChange={e=>updateIngredient(i,"resourceId",e.target.value)}><option value="">Select resource</option>{resources.filter(r=>r.id!==form.id).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select><input type="number" min="0.001" step="any" value={ing.quantity} onChange={e=>updateIngredient(i,"quantity",Number(e.target.value))}/><button type="button" onClick={()=>patch("ingredients",form.ingredients.filter((_,j)=>j!==i))}>Remove</button></div>)}
    {form.kind==="Raw material"&&<><div className="wide form-section">RAW MATERIAL SOURCE & OWNERSHIP</div><label>Location / Planet<input value={form.location} onChange={e=>patch("location",e.target.value)}/></label><label>Supplier / Organization<input value={form.supplier} onChange={e=>patch("supplier",e.target.value)}/></label><label className="wide">Owner / Controlling group<input value={form.owner} onChange={e=>patch("owner",e.target.value)}/></label><label className="wide">Acquisition method<input value={form.acquisition} onChange={e=>patch("acquisition",e.target.value)}/></label></>}
    <label className="wide">Additional notes<textarea value={form.notes} onChange={e=>patch("notes",e.target.value)} rows={2}/></label>
    <div className="wide coordinates">Map hotspot: {typeof form.x==="number"?`X ${Math.round(form.x)} · Y ${Math.round(form.y||0)}`:"Not placed"} <span>Save, select this resource, then use ＋ Hotspot on the map to position it.</span></div>
  </div><div className="modal-actions">{resources.some(r=>r.id===form.id)&&<button className="danger" onClick={onDelete}>Delete</button>}<div/><button onClick={onClose}>Cancel</button><button className="primary" disabled={!form.name.trim()} onClick={()=>onSave({...form,name:form.name.trim(),ingredients:form.ingredients.filter(i=>i.resourceId&&i.quantity>0)})}>Save resource</button></div></div></div>;
}
