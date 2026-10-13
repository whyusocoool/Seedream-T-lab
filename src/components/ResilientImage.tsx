import {useEffect,useState} from 'react';
import {cloudRepository} from '@/data/cloudRepository';
export default function ResilientImage({src,assetPath,alt,className,retryable=false}:{src?:string;assetPath?:string;alt:string;className?:string;retryable?:boolean}){
  const [url,setUrl]=useState(src),[failed,setFailed]=useState(false),[refreshed,setRefreshed]=useState(false);
  useEffect(()=>{setUrl(src);setFailed(false);setRefreshed(false)},[src,assetPath]);
  const retry=async()=>{
    setRefreshed(true);
    try{if(assetPath)setUrl(await cloudRepository.imageUrl(assetPath));else if(src){const next=new URL(src,window.location.href);next.searchParams.set('imageRetry',String(Date.now()));setUrl(next.href);}else return;setFailed(false);}catch{setFailed(true)}
  };
  if(!url||failed)return <span className={className} style={{display:'flex',height:'100%',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:8,color:'#7b7771',fontSize:14}}><span>{url?'图片加载失败':'参考图待恢复'}</span>{url&&retryable&&<button type="button" onClick={event=>{event.preventDefault();event.stopPropagation();void retry()}}>重新加载</button>}</span>;
  return <img draggable={false} src={url} alt={alt} className={className} onError={()=>{if(assetPath&&!refreshed)void retry();else setFailed(true)}}/>;
}
