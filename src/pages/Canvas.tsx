import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '@/components/AppHeader';
import { useAppStore } from '@/store/appStore';
import { cloudRepository, isWorkspaceRole } from '@/data/cloudRepository';
import { cloudEnabled } from '@/data/supabase';
import { cloudRead } from '@/data/cloudRead';

type CanvasItem = { id:string; src:string; assetPath?:string; x:number; y:number; w:number; h:number; ratio?:number; z?:number; group?:string; pile?:string; tags?:string[]; templated:boolean; label:string };
type Filter = 'all'|'templated'|'loose';
type GroupMeta = { tags:string[]; layout:'tile'|'stack' };
type TagCategory={id:string;name:string;tags:string[]};
type LayoutRecord={ids:string[];mode:'tile'|'stack'};
type Snapshot={items:CanvasItem[];groups:Record<string,GroupMeta>;selected:Set<string>;layouts:Map<string,LayoutRecord>};
type CanvasSession=Snapshot & {history:Snapshot[];query:string;filter:Filter;zoom:number;offset:{x:number;y:number};tagCategories?:TagCategory[];tagFilter?:Set<string>;schemaVersion?:number};
type CanvasCloudPayload={items:CanvasItem[];groups:Record<string,GroupMeta>;query:string;filter:Filter;zoom:number;offset:{x:number;y:number};tagCategories:TagCategory[];tagFilter:string[];schemaVersion:number};
// Role-scoped memory cache keeps canvas state while this browser tab remains open.
const canvasSessions=new Map<string,CanvasSession>();
const CANVAS_SCHEMA_VERSION=4;
const defaultTagCategories:TagCategory[]=[
  {id:'background',name:'背景',tags:['背景干净','背景复杂']},
  {id:'subjects',name:'主体数量',tags:['单主体','双主体','多主体']},
  {id:'content',name:'内容类型',tags:['人物','动物','静物','风景','建筑']},
];
const templateGroupDefaults:Record<string,{id:string;tags:string[];layout:'tile'|'stack'}>={
  '拼豆风格':{id:'template-group-perler',tags:['拼豆风格','图片'],layout:'tile'},
  '手帐贴纸':{id:'template-group-notebook',tags:['手帐贴纸','笔记'],layout:'stack'},
};
const upgradeTemplateGroups=(session:CanvasSession,isTester=false):CanvasSession=>{
  if((session.schemaVersion||0)>=CANVAS_SCHEMA_VERSION)return session;
  if(isTester)return {...session,items:session.items.map(item=>({...item,group:undefined})),groups:{},tagCategories:session.tagCategories||structuredClone(defaultTagCategories),tagFilter:new Set(session.tagFilter||[]),schemaVersion:CANVAS_SCHEMA_VERSION};
  const groups={...session.groups};
  Object.values(templateGroupDefaults).forEach(preset=>{
    const current=groups[preset.id];
    if(current?.tags.length===1&&current.tags[0]===preset.tags.join('/'))groups[preset.id]={...current,tags:[...preset.tags]};
  });
  const items=session.items.map(item=>{
    const preset=item.templated&&!item.group?templateGroupDefaults[item.label]:undefined;
    if(!preset)return item;
    groups[preset.id]||={tags:[...preset.tags],layout:preset.layout};
    return {...item,group:preset.id};
  });
  return {...session,items,groups,schemaVersion:CANVAS_SCHEMA_VERSION};
};
const fileAsDataUrl=(file:File)=>new Promise<string>((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result));
  reader.onerror=()=>reject(reader.error);
  reader.readAsDataURL(file);
});
const cloudImageTypes=new Set(['image/jpeg','image/png','image/webp','image/gif']);
const normalizeImageFile=async(file:File):Promise<File>=>{
  if(cloudImageTypes.has(file.type))return file;
  const source=await fileAsDataUrl(file);
  const image=await new Promise<HTMLImageElement>((resolve,reject)=>{
    const element=new Image();element.onload=()=>resolve(element);element.onerror=()=>reject(new Error('Safari 剪贴板图片无法解码'));element.src=source;
  });
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const context=canvas.getContext('2d');if(!context)throw new Error('无法转换剪贴板图片');
  context.drawImage(image,0,0);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('无法转换剪贴板图片')),'image/png'));
  return new File([blob],`${file.name.replace(/\.[^.]+$/,'')||'clipboard'}.png`,{type:'image/png'});
};

// 画布内容属于数据层，不属于网页代码。首次打开时保持空白，用户添加的内容
// 会按工作区和角色保存到本地；启用云端后则由云端画布文档作为唯一来源。
const canvasStorageKey = (scopeId: string) => `seedream-canvas-data/${scopeId}`;
const readCanvasData = (scopeId: string): CanvasSession | undefined => {
  try {
    const raw = window.localStorage.getItem(canvasStorageKey(scopeId));
    if (!raw) return undefined;
    const payload = JSON.parse(raw) as CanvasCloudPayload;
    return {
      ...payload,
      selected: new Set<string>(),
      layouts: new Map<string, LayoutRecord>(),
      history: [],
      tagFilter: new Set(payload.tagFilter || []),
    };
  } catch {
    return undefined;
  }
};

export default function Canvas(){
  const user=useAppStore(s=>s.currentUser);
  const workspaceId=useAppStore(s=>s.workspace.id);
  if(!user)return null;
  const scopeId=JSON.stringify([workspaceId,user.role]);
  return <ScopedCanvas key={scopeId} scopeId={scopeId} workspaceId={workspaceId}/>;
}

function ScopedCanvas({scopeId,workspaceId}:{scopeId:string;workspaceId:string}){
  const nav=useNavigate();
  const user=useAppStore(s=>s.currentUser);
  const isTester=user?.role==='tester';
  const activeRole=user?.role;
  const job=activeRole&&isWorkspaceRole(activeRole)?activeRole:null;
  const [saved]=useState(()=>{
    // Cloud data must be hydrated before rendering; never restore a stale in-memory snapshot.
    if (cloudEnabled) return undefined;
    const previous=canvasSessions.get(scopeId);
    if (previous) return upgradeTemplateGroups(structuredClone(previous), isTester);
    const stored=readCanvasData(scopeId);
    return stored ? upgradeTemplateGroups(stored, isTester) : undefined;
  });
  const [items,setItems]=useState<CanvasItem[]>(()=>saved?.items||[]);
  const layouts=useRef(saved?.layouts||new Map<string,LayoutRecord>());
  const invalidatePartialLayouts=(ids:string[])=>{
    const affected=new Set(ids);
    for(const [key,layout] of layouts.current){
      if(layout.ids.some(id=>affected.has(id))&&!layout.ids.every(id=>affected.has(id)))layouts.current.delete(key);
    }
  };
  const applyLayoutMode=(ids:string[],mode:'tile'|'stack')=>{
    const key=JSON.stringify([...ids].sort());
    if(layouts.current.get(key)?.mode===mode)return false;
    recordHistory();
    const affected=new Set(ids);
    for(const [existing,layout] of layouts.current){
      if(layout.ids.some(id=>affected.has(id)))layouts.current.delete(existing);
    }
    layouts.current.set(key,{ids:[...ids],mode});
    return true;
  };
  const [selected,setSelected]=useState<Set<string>>(()=>saved?.selected||new Set());
  const [groups,setGroups]=useState<Record<string,GroupMeta>>(()=>saved?.groups||{});
  const history=useRef<Snapshot[]>(saved?.history||[]);
  const currentSnapshot=useRef({items,groups,selected});
  currentSnapshot.current={items,groups,selected};
  const recordHistory=()=>{
    history.current.push({...currentSnapshot.current,selected:new Set(currentSnapshot.current.selected),layouts:new Map(layouts.current)});
    if(history.current.length>100)history.current.shift();
  };
  const [query,setQuery]=useState(saved?.query||'');
  const [tagEditor,setTagEditor]=useState(false);
  const [tagDraft,setTagDraft]=useState<string[]>(['']);
  const tagEditorRef=useRef<HTMLDivElement>(null);
  const [filter,setFilter]=useState<Filter>(saved?.filter||'all');
  const [tagCategories,setTagCategories]=useState<TagCategory[]>(()=>saved?.tagCategories||structuredClone(defaultTagCategories));
  const [tagFilter,setTagFilter]=useState<Set<string>>(()=>new Set(saved?.tagFilter||[]));
  const [testerTagOpen,setTesterTagOpen]=useState(false);
  const [testerTagInput,setTesterTagInput]=useState('');
  const [testerTagSelection,setTesterTagSelection]=useState<Set<string>>(new Set());
  const [testerTagDirtyCategories,setTesterTagDirtyCategories]=useState<Set<string>>(new Set());
  const [editingPreset,setEditingPreset]=useState<{categoryId:string;index:number}|null>(null);
  const [presetDraft,setPresetDraft]=useState('');
  const [zoom,setZoom]=useState(saved?.zoom||1);
  const [offset,setOffset]=useState(saved?.offset||{x:0,y:0});
  const [cloudReady,setCloudReady]=useState(!cloudEnabled);
  const [cloudError,setCloudError]=useState('');
  const [cloudRetry,setCloudRetry]=useState(0);
  const cloudBaseline=useRef<string|null>(null);
  const cloudWritable=useRef(false);
  const zoomRef=useRef(zoom);
  const offsetRef=useRef(offset);
  const [filterOpen,setFilterOpen]=useState(false);
  const [marquee,setMarquee]=useState<{x:number;y:number;w:number;h:number}|null>(null);
  const [marqueeDragging,setMarqueeDragging]=useState(false);
  const [fileDragging,setFileDragging]=useState(false);
  const [canvasNotice,setCanvasNotice]=useState('');
  const [isImporting,setIsImporting]=useState(false);
  const surface=useRef<HTMLDivElement>(null);
  const viewport=useRef<HTMLDivElement>(null);
  const spacePressed=useRef(false);
  useEffect(()=>{
    const session={items,groups,selected:new Set(selected),layouts:new Map(layouts.current),history:[...history.current],query,filter,zoom,offset,tagCategories,tagFilter:new Set(tagFilter),schemaVersion:CANVAS_SCHEMA_VERSION};
    canvasSessions.set(scopeId,session);
    if (!cloudEnabled) {
      try {
        window.localStorage.setItem(canvasStorageKey(scopeId), JSON.stringify({
          items, groups, query, filter, zoom, offset, tagCategories, tagFilter:[...tagFilter], schemaVersion:CANVAS_SCHEMA_VERSION,
        } satisfies CanvasCloudPayload));
      } catch (error) {
        console.warn('[canvas] 本地画布数据保存失败', error);
      }
    }
  },[scopeId,items,groups,selected,query,filter,zoom,offset,tagCategories,tagFilter]);
  useEffect(()=>{
    if(!cloudEnabled||!job)return;
    let active=true;cloudWritable.current=false;cloudBaseline.current=null;setCloudReady(false);setCloudError('');
    void cloudRead(cloudRepository.loadCanvas<CanvasCloudPayload>(workspaceId,job)).then(async document=>{
      if(!active)return;
      if(!document?.payload){
        setCanvasNotice('云端未返回当前角色的画布记录，可能不存在或没有读取权限。未写回空画布，也未导入其他角色的旧画布。');
        cloudBaseline.current=JSON.stringify({items,groups,query,filter,zoom,offset,tagCategories,tagFilter:[...tagFilter],schemaVersion:CANVAS_SCHEMA_VERSION});
        cloudWritable.current=true;setCloudReady(true);return;
      }
      const payload=document.payload;
      if(!Array.isArray(payload.items))throw new Error('云端画布格式异常，已阻止自动保存');
      const hydrated=await cloudRead(Promise.all(payload.items.map(async item=>item.assetPath?{...item,src:await cloudRepository.imageUrl(item.assetPath!)}:item)));
      if(!active)return;
      setItems(hydrated);setGroups(payload.groups||{});setQuery(payload.query||'');setFilter(payload.filter||'all');setZoom(payload.zoom||1);setOffset(payload.offset||{x:0,y:0});setTagCategories(payload.tagCategories||structuredClone(defaultTagCategories));setTagFilter(new Set(payload.tagFilter||[]));
      cloudBaseline.current=JSON.stringify({items:hydrated,groups:payload.groups||{},query:payload.query||'',filter:payload.filter||'all',zoom:payload.zoom||1,offset:payload.offset||{x:0,y:0},tagCategories:payload.tagCategories||structuredClone(defaultTagCategories),tagFilter:payload.tagFilter||[],schemaVersion:CANVAS_SCHEMA_VERSION});
      cloudWritable.current=true;setCloudReady(true);
    }).catch(error=>{console.warn('[canvas] 云端读取失败，禁止保存',error);if(active)setCloudError(String(error?.message||error||'读取失败'));});
    return()=>{active=false;cloudWritable.current=false};
  // Editing is blocked until hydration succeeds. Retry rereads without clearing stored data.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[job,workspaceId,cloudRetry]);
  useEffect(()=>{
    if(!cloudEnabled||!cloudReady||!job)return;
    const timer=window.setTimeout(()=>{
      const payload:CanvasCloudPayload={items,groups,query,filter,zoom,offset,tagCategories,tagFilter:[...tagFilter],schemaVersion:CANVAS_SCHEMA_VERSION};
      const serialized=JSON.stringify(payload);
      if(!cloudWritable.current||cloudBaseline.current===null||cloudBaseline.current===serialized)return;
      void cloudRepository.saveCanvas(workspaceId,job,payload).then(()=>{cloudBaseline.current=serialized;}).catch(error=>{console.warn('[canvas] 云端保存失败',error);setCanvasNotice(`保存失败，当前内容仍在页面中：${String(error?.message||error)}`);});
    },1200);
    return()=>window.clearTimeout(timer);
  },[cloudReady,filter,groups,items,job,offset,query,tagCategories,tagFilter,workspaceId,zoom]);
  useEffect(()=>()=>{
    // Finish any active gesture when leaving a role's canvas.
    window.dispatchEvent(new Event('pointerup'));
  },[]);
  useEffect(()=>{
    const handleCanvasKey=(e:KeyboardEvent)=>{
      const target=e.target as HTMLElement|null;
      if(target?.closest('input,textarea,select')||target?.isContentEditable||e.isComposing)return;
      if((e.key==='Delete'||e.key==='Backspace')&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
        const current=currentSnapshot.current;
        if(!current.selected.size)return;
        e.preventDefault();
        window.dispatchEvent(new Event('pointerup'));
        const deleted=new Set(current.selected);
        const linkedGroups=new Set(current.items.filter(i=>deleted.has(i.id)&&i.group).map(i=>i.group));
        const linkedPiles=new Set(current.items.filter(i=>deleted.has(i.id)&&i.pile).map(i=>i.pile));
        current.items.forEach(i=>{
          if((i.group&&linkedGroups.has(i.group))||(i.pile&&linkedPiles.has(i.pile)))deleted.add(i.id);
        });
        recordHistory();
        const remaining=current.items.filter(i=>!deleted.has(i.id));
        const remainingGroups=new Set(remaining.map(i=>i.group));
        const nextGroups=Object.fromEntries(Object.entries(current.groups).filter(([id])=>remainingGroups.has(id)));
        for(const [key,layout] of layouts.current){
          if(layout.ids.some(id=>deleted.has(id)))layouts.current.delete(key);
        }
        const next={items:remaining,groups:nextGroups,selected:new Set<string>()};
        currentSnapshot.current=next;
        setItems(next.items);
        setGroups(next.groups);
        setSelected(next.selected);
        setTagEditor(false);
        setMarquee(null);
        setMarqueeDragging(false);
        return;
      }
      if(!(e.ctrlKey||e.metaKey)||e.shiftKey||e.altKey||e.key.toLowerCase()!=='z')return;
      e.preventDefault();
      window.dispatchEvent(new Event('pointerup'));
      const previous=history.current.pop();
      if(!previous)return;
      layouts.current=new Map(previous.layouts);
      currentSnapshot.current=previous;
      setItems(previous.items);
      setGroups(previous.groups);
      setSelected(new Set(previous.selected));
      setTagEditor(false);
      setMarquee(null);
      setMarqueeDragging(false);
    };
    window.addEventListener('keydown',handleCanvasKey);
    return()=>window.removeEventListener('keydown',handleCanvasKey);
  },[]);
  const visible=useMemo(
    ()=>items.filter(i=>{
      const matchesFilter=isTester?tagCategories.every(category=>{const active=category.tags.filter(tag=>tagFilter.has(tag));return !active.length||active.some(tag=>i.tags?.includes(tag))}):filter==='all'||(filter==='templated'?i.templated:!i.templated);
      const words=`${i.label} ${i.tags?.join(' ')||''} ${(i.group&&groups[i.group]?.tags.join(' '))||''}`.toLowerCase();
      return matchesFilter&&words.includes(query.trim().toLowerCase());
    }),
    [items,filter,groups,query,isTester,tagFilter,tagCategories],
  );

  const selectedItems=useMemo(()=>items.filter(i=>selected.has(i.id)),[items,selected]);
  const selectedBounds=useMemo(()=>{
    if(!selectedItems.length)return null;
    const left=Math.min(...selectedItems.map(i=>i.x*zoom+offset.x));
    const top=Math.min(...selectedItems.map(i=>i.y*zoom+offset.y));
    const right=Math.max(...selectedItems.map(i=>(i.x+i.w)*zoom+offset.x));
    const bottom=Math.max(...selectedItems.map(i=>(i.y+i.h)*zoom+offset.y));
    return {left,top,right,bottom,width:right-left,height:bottom-top};
  },[selectedItems,zoom,offset]);
  const selectedGroupIds=[...new Set(selectedItems.map(i=>i.group).filter(Boolean) as string[])];
  const isWholeSingleGroup=selectedGroupIds.length===1&&selectedItems.length>0&&selectedItems.every(i=>i.group===selectedGroupIds[0])&&items.filter(i=>i.group===selectedGroupIds[0]).every(i=>selected.has(i.id));

  const addImageFiles=async(files:File[],dropPoint?:{clientX:number;clientY:number})=>{
    if(cloudEnabled&&!cloudReady){setCanvasNotice('请先成功读取画布，再添加图片');return;}
    const imageFiles=files.filter(file=>file.type.startsWith('image/'));
    if(!imageFiles.length){setCanvasNotice('剪贴板中没有可读取的图片');return;}
    setIsImporting(true);
    setCanvasNotice('正在读取图片…');
    let normalized:File[];
    try{normalized=await Promise.all(imageFiles.map(normalizeImageFile))}catch(error){setCanvasNotice(error instanceof Error?error.message:'图片格式转换失败');setIsImporting(false);return;}
    let localUrls:string[];
    try{localUrls=await Promise.all(normalized.map(fileAsDataUrl))}
    catch(error){setCanvasNotice(`图片添加失败：${error instanceof Error?error.message:'图片读取失败'}`);setIsImporting(false);return;}
    recordHistory();
    const batchId=crypto.randomUUID();
    const viewportRect=viewport.current?.getBoundingClientRect();
    const origin=dropPoint&&viewportRect
      ?{x:(dropPoint.clientX-viewportRect.left-offset.x-90*zoom)/zoom,y:(dropPoint.clientY-viewportRect.top-offset.y-70*zoom)/zoom}
      :{x:(260-offset.x)/zoom,y:(150-offset.y)/zoom};
    const newItems:CanvasItem[]=normalized.map((_,i)=>({
      id:`image-${batchId}-${i}`,
      src:localUrls[i],
      x:origin.x+i*36/zoom,y:origin.y+i*36/zoom,
      w:180,h:140,templated:false,label:'新图片',
    }));
    setItems(old=>[...old,...newItems]);
    setSelected(new Set(newItems.map(item=>item.id)));
    setIsImporting(false);
    if(!cloudEnabled||!job){setCanvasNotice(`已添加 ${newItems.length} 张图片`);return;}

    // Do not put network latency in the paste path. Images appear immediately,
    // then each successful upload swaps the local preview for its durable URL.
    setCanvasNotice(`已添加 ${newItems.length} 张，正在后台保存…`);
    void Promise.allSettled(normalized.map(async(file,index)=>{
      const uploaded=await cloudRepository.uploadImage(workspaceId,job,file);
      setItems(old=>old.map(item=>item.id===newItems[index].id?{...item,src:uploaded.url,assetPath:uploaded.path}:item));
    })).then(results=>{
      const failed=results.filter(result=>result.status==='rejected');
      setCanvasNotice(failed.length
        ?`图片已添加；${failed.length} 张因网络问题尚未云端保存`
        :`已添加并保存 ${newItems.length} 张图片`);
    });
  };

  useEffect(()=>{
    const paste=async(e:ClipboardEvent)=>{
      const direct=[...(e.clipboardData?.files||[])];
      const itemFiles=[...(e.clipboardData?.items||[])].filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter((file):file is File=>!!file);
      const files=direct.length?direct:itemFiles;
      if(!files.some(file=>file.type.startsWith('image/')))return;
      e.preventDefault();
      await addImageFiles(files);
    };
    window.addEventListener('paste',paste);
    return()=>window.removeEventListener('paste',paste);
  },[job,offset,workspaceId,zoom]);

  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{if(e.code==='Space')spacePressed.current=true};
    const up=(e:KeyboardEvent)=>{if(e.code==='Space')spacePressed.current=false};
    window.addEventListener('keydown',down);
    window.addEventListener('keyup',up);
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up)};
  },[]);

  useEffect(()=>{zoomRef.current=zoom},[zoom]);
  useEffect(()=>{offsetRef.current=offset},[offset]);

  const beginDrag=(e:React.PointerEvent,id:string)=>{
    e.preventDefault();
    e.stopPropagation();
    window.getSelection()?.removeAllRanges();
    const additive=e.shiftKey||e.metaKey;
    const clicked=items.find(i=>i.id===id);
    const linkedIds=clicked?.group
      ?items.filter(i=>i.group===clicked.group).map(i=>i.id)
      :clicked?.pile?items.filter(i=>i.pile===clicked.pile).map(i=>i.id):[id];
    const alreadySelected=linkedIds.every(linkedId=>selected.has(linkedId));
    const nextSelection=new Set(additive||alreadySelected?selected:[]);
    if(additive&&alreadySelected)linkedIds.forEach(linkedId=>nextSelection.delete(linkedId));
    else linkedIds.forEach(linkedId=>nextSelection.add(linkedId));
    setSelected(nextSelection);
    if(additive&&alreadySelected)return;
    const start={x:e.clientX,y:e.clientY};
    const ids=[...nextSelection];
    const origins=new Map(items.filter(i=>ids.includes(i.id)).map(i=>[i.id,{x:i.x,y:i.y}]));
    let recorded=false;
    const move=(ev:PointerEvent)=>{if(!recorded){if(ev.clientX===start.x&&ev.clientY===start.y)return;recordHistory();recorded=true;}invalidatePartialLayouts(ids);setItems(old=>old.map(i=>{
      const o=origins.get(i.id);
      return o?{...i,x:o.x+(ev.clientX-start.x)/zoom,y:o.y+(ev.clientY-start.y)/zoom}:i;
    }));};
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',up);
  };

  const beginResize=(e:React.PointerEvent,id:string)=>{
    e.preventDefault();
    e.stopPropagation();
    window.getSelection()?.removeAllRanges();
    const item=items.find(i=>i.id===id); if(!item)return;
    // Resize the selection as one unit, regardless of group or pile membership.
    const groupItems=selected.has(id)
      ?items.filter(i=>selected.has(i.id))
      :[item];
    const anchor={x:Math.min(...groupItems.map(i=>i.x)),y:Math.min(...groupItems.map(i=>i.y))};
    const originals=new Map(groupItems.map(i=>[i.id,{x:i.x,y:i.y,w:i.w,h:i.h}]));
    const start={x:e.clientX,h:item.h};
    let recorded=false;
    const move=(ev:PointerEvent)=>{
      if(!recorded){if(ev.clientX===start.x)return;recordHistory();recorded=true;}
      invalidatePartialLayouts(groupItems.map(i=>i.id));
      const targetHeight=Math.max(64,start.h+(ev.clientX-start.x)/zoom);
      const scale=targetHeight/start.h;
      setItems(old=>old.map(i=>{
        const original=originals.get(i.id); if(!original)return i;
        return {...i,x:anchor.x+(original.x-anchor.x)*scale,y:anchor.y+(original.y-anchor.y)*scale,w:original.w*scale,h:original.h*scale};
      }));
    };
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',up);
  };

  const backgroundStart=(e:React.PointerEvent)=>{
    if((e.target as HTMLElement)!==surface.current)return;
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    const shouldPan=e.button===1||spacePressed.current;
    if(shouldPan){
      const start={sx:e.clientX,sy:e.clientY,ox:offset.x,oy:offset.y};
      const move=(ev:PointerEvent)=>setOffset({x:start.ox+ev.clientX-start.sx,y:start.oy+ev.clientY-start.sy});
      const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};
      window.addEventListener('pointermove',move); window.addEventListener('pointerup',up);
      return;
    }
    if(e.button!==0)return;
    const rect=viewport.current?.getBoundingClientRect(); if(!rect)return;
    const start={x:e.clientX-rect.left,y:e.clientY-rect.top};
    const additive=e.shiftKey||e.metaKey;
    const base=new Set(additive?selected:[]);
    if(!additive)setSelected(new Set());
    let dragging=false;
    const move=(ev:PointerEvent)=>{
      const current={x:ev.clientX-rect.left,y:ev.clientY-rect.top};
      if(!dragging&&Math.hypot(current.x-start.x,current.y-start.y)<3)return;
      if(!dragging){
        dragging=true;
        setMarqueeDragging(true);
      }
      const box={x:Math.min(start.x,current.x),y:Math.min(start.y,current.y),w:Math.abs(current.x-start.x),h:Math.abs(current.y-start.y)};
      setMarquee(box);
      const next=new Set(base);
      visible.forEach(item=>{
        const image={x:item.x*zoom+offset.x,y:item.y*zoom+offset.y,w:item.w*zoom,h:item.h*zoom};
        if(box.x<image.x+image.w&&box.x+box.w>image.x&&box.y<image.y+image.h&&box.y+box.h>image.y){
          if(item.group)items.filter(i=>i.group===item.group).forEach(i=>next.add(i.id));
          else if(item.pile)items.filter(i=>i.pile===item.pile).forEach(i=>next.add(i.id));
          else next.add(item.id);
        }
      });
      setSelected(next);
    };
    const finish=()=>{
      setMarquee(null);
      setMarqueeDragging(false);
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',finish);
      window.removeEventListener('pointercancel',finish);
      window.removeEventListener('blur',finish);
    };
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',finish);
    window.addEventListener('pointercancel',finish);
    window.addEventListener('blur',finish);
  };

  const zoomAtPointer=(e:React.WheelEvent)=>{
    e.preventDefault();
    const rect=viewport.current?.getBoundingClientRect(); if(!rect)return;
    const pointer={x:e.clientX-rect.left,y:e.clientY-rect.top};
    const factor=e.deltaY>0?.92:1.08;
    const current=zoomRef.current;
    const origin=offsetRef.current;
    const next=Math.min(2.2,Math.max(.45,current*factor));
    if(next===current)return;
    const nextOffset={
      x:pointer.x-(pointer.x-origin.x)*(next/current),
      y:pointer.y-(pointer.y-origin.y)*(next/current),
    };
    zoomRef.current=next;
    offsetRef.current=nextOffset;
    setZoom(next);
    setOffset(nextOffset);
  };

  const chosenForLayout=()=>{
    const ids=selected.size?[...selected]:visible.map(i=>i.id);
    return {ids,chosen:items.filter(i=>ids.includes(i.id))};
  };

  const tile=()=>{
    const {ids,chosen}=chosenForLayout(); if(!chosen.length)return;
    if(!applyLayoutMode(ids,'tile'))return;
    const cx=chosen.reduce((n,i)=>n+i.x,0)/chosen.length;
    const cy=chosen.reduce((n,i)=>n+i.y,0)/chosen.length;
    const columns=chosen.length<=3?chosen.length:Math.ceil(Math.sqrt(chosen.length));
    const rows=Math.ceil(chosen.length/columns);
    const startY=cy-((rows-1)*128)/2;
    const layout=new Map<string,{x:number;y:number;w:number;h:number}>();
    for(let row=0;row<rows;row++){
      const rowIds=ids.slice(row*columns,(row+1)*columns);
      const widths=rowIds.map(rowId=>{const item=items.find(i=>i.id===rowId)!;return 108*(item.ratio||item.w/item.h)});
      const total=widths.reduce((sum,w)=>sum+w,0)+Math.max(0,rowIds.length-1)*16;
      let x=cx-total/2;
      rowIds.forEach((rowId,index)=>{layout.set(rowId,{x,y:startY+row*128,w:widths[index],h:108});x+=widths[index]+16});
    }
    setItems(old=>old.map(i=>{const next=layout.get(i.id);return next?{...i,...next,z:undefined,pile:i.group?i.pile:undefined}:i}));
    selectedGroupIds.forEach(id=>setGroups(old=>({...old,[id]:{...old[id],layout:'tile'}})));
  };

  const stack=()=>{
    const {ids,chosen}=chosenForLayout(); if(!chosen.length)return;
    if(!applyLayoutMode(ids,'stack'))return;
    const cx=chosen.reduce((n,i)=>n+i.x,0)/chosen.length;
    const cy=chosen.reduce((n,i)=>n+i.y,0)/chosen.length;
    const first=chosen.reduce((bottomRight,item)=>{
      const itemBottom=item.y+item.h;
      const currentBottom=bottomRight.y+bottomRight.h;
      if(itemBottom!==currentBottom)return itemBottom>currentBottom?item:bottomRight;
      return item.x+item.w>bottomRight.x+bottomRight.w?item:bottomRight;
    });
    const orderedIds=[...ids.filter(id=>id!==first.id),first.id];
    const step=9;
    const startX=cx-((chosen.length-1)*step)/2;
    const startY=cy-((chosen.length-1)*step)/2;
    const sharedRatio=first.ratio||first.w/first.h;
    const pileId=selectedGroupIds.length?undefined:`pile-${Date.now()}`;
    setItems(old=>old.map(i=>{const idx=orderedIds.indexOf(i.id);return idx<0?i:{...i,x:startX+idx*step,y:startY+idx*step,w:108*sharedRatio,h:108,z:idx+1,pile:i.group?i.pile:pileId}}));
    selectedGroupIds.forEach(id=>setGroups(old=>({...old,[id]:{...old[id],layout:'stack'}})));
  };

  const openPack=()=>{
    if(isWholeSingleGroup){
      recordHistory();
      const groupId=selectedGroupIds[0];
      setItems(old=>old.map(i=>i.group===groupId?{...i,group:undefined,pile:undefined,z:undefined}:i));
      setGroups(old=>{const next={...old};delete next[groupId];return next});
      return;
    }
    const existing=selectedGroupIds[0];
    if(existing&&selectedGroupIds.length===1){
      recordHistory();
      setItems(old=>old.map(i=>selected.has(i.id)?{...i,group:existing,pile:undefined}:i));
      setSelected(new Set(items.filter(i=>selected.has(i.id)||i.group===existing).map(i=>i.id)));
      setTagEditor(false);
      return;
    }
    setTagDraft(existing?[...(groups[existing]?.tags||[''])]:['']);
    setTagEditor(true);
  };

  const savePack=()=>{
    const tags=[...new Set(tagDraft.map(t=>t.trim()).filter(Boolean))].slice(0,3);
    if(!tags.length){setTagEditor(false);return;}
    if(isWholeSingleGroup&&JSON.stringify(tags)===JSON.stringify(groups[selectedGroupIds[0]]?.tags)){setTagEditor(false);return;}
    recordHistory();
    const groupId=selectedGroupIds[0]||`group-${Date.now()}`;
    const merging=new Set(selectedGroupIds);
    setItems(old=>old.map(i=>selected.has(i.id)||i.group&&merging.has(i.group)?{...i,group:groupId,pile:undefined}:i));
    setGroups(old=>{
      const next={...old};
      selectedGroupIds.filter(id=>id!==groupId).forEach(id=>delete next[id]);
      next[groupId]={tags,layout:next[groupId]?.layout||'tile'};
      return next;
    });
    setSelected(new Set(items.filter(i=>selected.has(i.id)||i.group&&merging.has(i.group)).map(i=>i.id)));
    setTagEditor(false);
  };

  useEffect(()=>{
    if(!tagEditor)return;
    const finish=(event:PointerEvent)=>{
      if(!tagEditorRef.current?.contains(event.target as Node))savePack();
    };
    document.addEventListener('pointerdown',finish,true);
    return()=>document.removeEventListener('pointerdown',finish,true);
  });

  const aggregate=()=>{
    const chosen=items.filter(i=>selected.has(i.id));
    if(!chosen.length)return;
    const assets=chosen.map(i=>({url:i.src,assetPath:i.assetPath}));
    if(user?.role==='tester')nav('/tests/new',{state:{assets}});
    else nav('/templates/new',{state:{assets}});
  };

  const closeTesterTags=()=>{
    setTesterTagOpen(false);
    setTesterTagInput('');
    setTesterTagSelection(new Set());
    setTesterTagDirtyCategories(new Set());
    setEditingPreset(null);
    setPresetDraft('');
  };
  const openTesterTags=(ids=[...selected])=>{
    const chosen=items.filter(item=>ids.includes(item.id));
    const common=chosen.length?(chosen[0].tags||[]).filter(tag=>chosen.every(item=>item.tags?.includes(tag))):[];
    const presets=new Set(tagCategories.flatMap(category=>category.tags));
    setTesterTagSelection(new Set(common.filter(tag=>presets.has(tag))));
    setTesterTagDirtyCategories(new Set());
    setTesterTagInput('');
    setEditingPreset(null);
    setPresetDraft('');
    setTesterTagOpen(true);
  };
  const toggleTesterPreset=(categoryId:string,tag:string)=>{
    const category=tagCategories.find(item=>item.id===categoryId);if(!category)return;
    setTesterTagDirtyCategories(old=>new Set(old).add(categoryId));
    setTesterTagSelection(old=>{
      const next=new Set(old);
      if(categoryId==='background'||categoryId==='subjects'){
        const wasSelected=next.has(tag);
        category.tags.forEach(item=>next.delete(item));
        if(!wasSelected)next.add(tag);
      }else next.has(tag)?next.delete(tag):next.add(tag);
      return next;
    });
  };
  const applyTesterTags=()=>{
    const typed=testerTagInput.split(/[#,，\s]+/).map(tag=>tag.trim()).filter(Boolean);
    const nextSelection=new Set(testerTagSelection);
    const dirty=new Set(testerTagDirtyCategories);
    const custom:string[]=[];
    typed.forEach(tag=>{
      const category=tagCategories.find(item=>item.tags.includes(tag));
      if(!category){custom.push(tag);return;}
      dirty.add(category.id);
      if(category.id==='background'||category.id==='subjects')category.tags.forEach(item=>nextSelection.delete(item));
      nextSelection.add(tag);
    });
    if(!dirty.size&&!custom.length){closeTesterTags();return;}
    recordHistory();
    setItems(old=>old.map(item=>{
      if(!selected.has(item.id))return item;
      let tags=[...(item.tags||[])];
      tagCategories.forEach(category=>{
        if(!dirty.has(category.id))return;
        tags=tags.filter(tag=>!category.tags.includes(tag));
        tags.push(...category.tags.filter(tag=>nextSelection.has(tag)));
      });
      return {...item,tags:[...new Set([...tags,...custom])].slice(0,6)};
    }));
    closeTesterTags();
  };
  const renameCategory=(id:string,name:string)=>setTagCategories(old=>old.map(category=>category.id===id?{...category,name}:category));
  const renamePreset=(categoryId:string,index:number,name:string)=>{
    const previous=tagCategories.find(category=>category.id===categoryId)?.tags[index];
    if(previous&&previous!==name){
      setItems(old=>old.map(item=>item.tags?.includes(previous)?{...item,tags:[...new Set(item.tags.map(tag=>tag===previous?name:tag).filter(Boolean))].slice(0,6)}:item));
      setTagFilter(old=>{const next=new Set(old);if(next.delete(previous)&&name)next.add(name);return next});
      setTesterTagSelection(old=>{const next=new Set(old);if(next.delete(previous)&&name)next.add(name);return next});
    }
    setTagCategories(old=>old.map(category=>category.id===categoryId?{...category,tags:category.tags.map((tag,i)=>i===index?name:tag)}:category));
  };
  const commitPresetEdit=()=>{
    if(!editingPreset)return;
    const {categoryId,index}=editingPreset;
    const oldTag=tagCategories.find(category=>category.id===categoryId)?.tags[index];
    const next=presetDraft.trim();
    if(oldTag!==undefined){
      if(next)renamePreset(categoryId,index,next);
      else{
        setTagCategories(old=>old.map(category=>category.id===categoryId?{...category,tags:category.tags.filter((_,i)=>i!==index)}:category));
        setItems(old=>old.map(item=>item.tags?.includes(oldTag)?{...item,tags:item.tags.filter(tag=>tag!==oldTag)}:item));
        setTagFilter(old=>{const nextFilter=new Set(old);nextFilter.delete(oldTag);return nextFilter});
        setTesterTagSelection(old=>{const nextSelection=new Set(old);nextSelection.delete(oldTag);return nextSelection});
      }
    }else if(next)setTagCategories(old=>old.map(category=>category.id===categoryId?{...category,tags:[...category.tags,next]}:category));
    setEditingPreset(null);
    setPresetDraft('');
  };

  const tagInputs=<>
    {tagDraft.map((tag,index)=><input key={index} autoFocus aria-label={`标签 ${index+1}`} title="清空内容即可删除此标签" placeholder="标签" value={tag} maxLength={30} style={{width:`${Math.max(3,Array.from(tag).reduce((n,c)=>n+(c.charCodeAt(0)>255?2:1),0))+1}ch`}} onChange={e=>setTagDraft(old=>old.map((value,i)=>i===index?e.target.value:value))} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();savePack();}}}/>)}
    {tagDraft.length<3&&<button aria-label="添加标签" onClick={()=>setTagDraft(old=>[...old,''])}>＋</button>}
  </>;

  return <div className="canvas-page">
    <AppHeader/>
    <div className="canvas-tools">
      <input placeholder="搜索图片" value={query} onChange={e=>setQuery(e.target.value)}/>
      <div>
        <button className="btn" disabled={isTester?!selected.size:selected.size<2&&!isWholeSingleGroup} onClick={()=>isTester?openTesterTags():openPack()}>{isTester?'标签':isWholeSingleGroup?'打散':'打包'}</button>
        <span className="filter-wrap">
          <button className="btn" onClick={()=>setFilterOpen(!filterOpen)}>筛选</button>
          {filterOpen&&<div className={`filter-menu ${isTester?'tester-filter-menu':''}`} onMouseLeave={()=>setFilterOpen(false)}>
            {isTester?tagCategories.map(category=><div className="tester-filter-category" key={category.id}><b>{category.name}</b><div>{category.tags.map(tag=><button className={tagFilter.has(tag)?'active':''} key={tag} onClick={()=>setTagFilter(old=>{const next=new Set(old);next.has(tag)?next.delete(tag):next.add(tag);return next})}>#{tag}</button>)}</div></div>):
            ([['all','全部'],['templated','已成模板'],['loose','未成模板']] as const).map(([v,l])=>
              <button className={filter===v?'active':''} onClick={()=>{setFilter(v);setFilterOpen(false)}} key={v}>{l}</button>
            )}
          </div>}
        </span>
        <button className="btn primary" disabled={!selected.size} onClick={aggregate}>{user?.role==='tester'?'＋打包测试':'＋聚合模板'} <b>{selected.size||''}</b></button>
      </div>
    </div>
    <div
      ref={viewport}
      className={`canvas-viewport${marqueeDragging?' marquee-dragging':''}${fileDragging?' file-dragging':''}`}
      aria-busy={!cloudReady || isImporting}
      onWheel={zoomAtPointer}
      onDragEnter={event=>{event.preventDefault();if([...event.dataTransfer.types].includes('Files'))setFileDragging(true)}}
      onDragOver={event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy'}}
      onDragLeave={event=>{if(event.currentTarget===event.target)setFileDragging(false)}}
      onDrop={event=>{event.preventDefault();setFileDragging(false);void addImageFiles([...event.dataTransfer.files],{clientX:event.clientX,clientY:event.clientY})}}
    >
      <div ref={surface} className="infinite-surface" onPointerDown={backgroundStart}>
        {visible.map(item=><div key={item.id} className={`canvas-image ${item.group?'grouped':''} ${selected.has(item.id)?'selected':''}`} style={{left:item.x*zoom+offset.x,top:item.y*zoom+offset.y,width:item.w*zoom,height:item.h*zoom,zIndex:item.z}} onPointerDown={e=>beginDrag(e,item.id)}>
          <img src={item.src} alt={item.label} onLoad={e=>{const ratio=e.currentTarget.naturalWidth/e.currentTarget.naturalHeight;if(Number.isFinite(ratio)&&Math.abs((item.ratio||0)-ratio)>.001)setItems(old=>old.map(i=>i.id===item.id?{...i,ratio,w:i.h*ratio}:i))}}/>
          {isTester&&selected.size===1&&selected.has(item.id)&&!!item.tags?.length&&<div className="image-tag-strip" title="双击编辑标签" onPointerDown={event=>event.stopPropagation()} onDoubleClick={event=>{event.stopPropagation();setSelected(new Set([item.id]));openTesterTags([item.id]);}}>{item.tags.map(tag=><span key={tag}>#{tag}</span>)}</div>}
          {!item.group&&<span className="resize-handle" onPointerDown={e=>beginResize(e,item.id)}/>} 
        </div>)}
      </div>
      {!isTester&&Object.entries(groups).map(([groupId,meta])=>{
        const members=visible.filter(i=>i.group===groupId);if(!members.length)return null;
        const left=Math.min(...members.map(i=>i.x*zoom+offset.x));
        const top=Math.min(...members.map(i=>i.y*zoom+offset.y));
        const right=Math.max(...members.map(i=>(i.x+i.w)*zoom+offset.x));
        const bottom=Math.max(...members.map(i=>(i.y+i.h)*zoom+offset.y));
        const editing=tagEditor&&isWholeSingleGroup&&selectedGroupIds[0]===groupId;
        return <div key={groupId} className={`canvas-group-frame ${selectedGroupIds.includes(groupId)?'selected':''}`} style={{left:left-7,top:top-7,width:right-left+14,height:bottom-top+14}}><div ref={editing?tagEditorRef:undefined} className={`canvas-group-tags ${editing?'compact-tag-editor':''}`} onPointerDown={e=>e.stopPropagation()}>{editing?tagInputs:meta.tags.map(tag=><button className={selectedGroupIds.includes(groupId)?'selected':''} key={tag} title="单击选中组，双击编辑标签" onPointerDown={e=>e.stopPropagation()} onClick={()=>{
          setSelected(new Set(items.filter(i=>i.group===groupId).map(i=>i.id)));
        }} onDoubleClick={()=>{
          setSelected(new Set(items.filter(i=>i.group===groupId).map(i=>i.id)));
          setTagDraft([...meta.tags]);
          setTagEditor(true);
        }}>#{tag}</button>)}</div>{selectedGroupIds.includes(groupId)&&<span className="resize-handle" style={{display:'block',pointerEvents:'auto'}} aria-label="缩放图片组" onPointerDown={e=>beginResize(e,members[0].id)}/>}</div>;
      })}
      {selectedBounds&&<div className="layout-floater" style={{left:selectedBounds.right+10,top:selectedBounds.top}}>
        <button title="平铺" aria-label="平铺" onClick={tile}><svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M409.6 476.16H102.4c-30.72 0-51.2-20.48-51.2-51.2v-307.2c0-30.72 20.48-51.2 51.2-51.2h307.2c30.72 0 51.2 20.48 51.2 51.2v307.2c0 30.72-20.48 51.2-51.2 51.2zM936.96 476.16h-307.2c-30.72 0-51.2-20.48-51.2-51.2v-307.2c0-30.72 20.48-51.2 51.2-51.2h307.2c30.72 0 51.2 20.48 51.2 51.2v307.2c0 30.72-20.48 51.2-51.2 51.2zM409.6 967.68H102.4c-30.72 0-51.2-20.48-51.2-51.2v-307.2c0-30.72 20.48-51.2 51.2-51.2h307.2c30.72 0 51.2 20.48 51.2 51.2v307.2c0 25.6-20.48 51.2-51.2 51.2zM936.96 967.68h-307.2c-30.72 0-51.2-20.48-51.2-51.2v-307.2c0-30.72 20.48-51.2 51.2-51.2h307.2c30.72 0 51.2 20.48 51.2 51.2v307.2c0 25.6-20.48 51.2-51.2 51.2z"/></svg></button>
        <button title="叠放" aria-label="叠放" onClick={stack}><svg viewBox="0 0 24 24" aria-hidden="true" style={{transform:'rotate(180deg)'}}><rect x="1" y="1" width="19" height="19" rx="2.4"/><path d="M22 4v14.5a3.5 3.5 0 0 1-3.5 3.5H3.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg></button>
      </div>}
      {marquee&&<div className="selection-marquee" style={{left:marquee.x,top:marquee.y,width:marquee.w,height:marquee.h}}/>}
      {tagEditor&&selectedBounds&&!isWholeSingleGroup&&<div ref={tagEditorRef} className="inline-tag-editor compact-tag-editor" style={{left:Math.max(8,selectedBounds.left),top:Math.max(8,selectedBounds.top-31)}} onPointerDown={e=>e.stopPropagation()}>
        {tagInputs}
      </div>}
      {fileDragging&&<div className="canvas-drop-overlay" aria-live="polite">松开鼠标，将图片放入画布</div>}
      {!cloudReady&&<div className="canvas-loading-overlay" role={cloudError?'alert':'status'} aria-live="polite">{!cloudError&&<span className="canvas-spinner"/>}<div><b>{cloudError?'画布读取失败，已暂停保存':'正在加载画布'}</b><small>{cloudError||'正在同步图片和画布布局…'}</small>{cloudError&&<button type="button" className="btn" onClick={()=>setCloudRetry(value=>value+1)}>重新读取</button>}</div></div>}
      {isImporting&&<div className="canvas-loading-overlay compact" role="status" aria-live="polite"><span className="canvas-spinner"/><div><b>正在添加图片</b><small>正在读取并处理剪贴板图片…</small></div></div>}
      <div className="canvas-hint">{canvasNotice||'拖动空白处框选 · Shift 追加 · 空格/中键平移 · 滚轮缩放 · 可拖入或 ⌘V 粘贴图片'}</div>
      <div className="zoom-chip">{Math.round(zoom*100)}%</div>
    </div>
    {testerTagOpen&&<div className="tester-tag-backdrop" onPointerDown={event=>{if(event.target===event.currentTarget)closeTesterTags()}}><section className="tester-tag-dialog" role="dialog" aria-modal="true" aria-label="为图片添加标签"><header><div><span className="eyebrow">IMAGE TAGS · 最多 6 个</span><h2>为 {selected.size} 张图片添加标签</h2></div><button className="tester-tag-close" aria-label="关闭标签弹窗" title="关闭" onClick={closeTesterTags}>×</button></header><label className="tester-tag-entry"><span>自定义标签</span><input autoFocus value={testerTagInput} onChange={event=>setTesterTagInput(event.target.value)} placeholder="输入标签，以空格、逗号或 # 分隔" onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();applyTesterTags()}}}/></label><div className="tester-tag-presets">{tagCategories.map(category=><section key={category.id}><div className="tester-category-head"><input aria-label="类别名称" value={category.name} onChange={event=>renameCategory(category.id,event.target.value)}/></div><div className="tester-preset-row">{category.tags.map((tag,index)=>editingPreset?.categoryId===category.id&&editingPreset.index===index?<input className="tester-preset-edit" key={`${category.id}-${index}`} autoFocus value={presetDraft} placeholder="新标签" onChange={event=>setPresetDraft(event.target.value)} onBlur={commitPresetEdit} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();commitPresetEdit()}}}/>:<button key={`${category.id}-${tag}`} className={testerTagSelection.has(tag)?'selected':''} title="单击选择，双击编辑" onClick={()=>toggleTesterPreset(category.id,tag)} onDoubleClick={()=>{setEditingPreset({categoryId:category.id,index});setPresetDraft(tag)}}>#{tag}</button>)}{editingPreset?.categoryId===category.id&&editingPreset.index===category.tags.length&&<input className="tester-preset-edit" autoFocus value={presetDraft} placeholder="新标签" onChange={event=>setPresetDraft(event.target.value)} onBlur={commitPresetEdit} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();commitPresetEdit()}}}/>}<button className="tester-add-preset" title="新增标签" aria-label={`在${category.name}中新增标签`} onClick={()=>{commitPresetEdit();setEditingPreset({categoryId:category.id,index:category.tags.length});setPresetDraft('')}}>＋</button></div></section>)}</div><footer><span>{testerTagSelection.size} 个预设标签已选</span><button className="btn primary" onClick={applyTesterTags}>应用标签</button></footer></section></div>}
  </div>
}
