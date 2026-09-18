import { useEffect, useRef, type ReactNode } from 'react';

export default function FitDialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const d=ref.current;d?.showModal();return()=>d?.close();},[]);
  return <dialog ref={ref} className="fit-dialog" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}} aria-label={title}><header><h2>{title}</h2><button className="btn" onClick={onClose} aria-label="关闭">关闭 ×</button></header>{children}</dialog>;
}
