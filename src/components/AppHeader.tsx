import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppStore } from '@/store/appStore';
import AIStatusButton from '@/components/AIStatusButton';
import '@/styles/app-shell.css';
import '@/styles/ai-runtime.css';
import AccountDialog from '@/components/AccountDialog';

export default function AppHeader({showNavigation=true}:{showNavigation?:boolean}){
  const user=useAppStore(s=>s.currentUser);
  const [accountOpen,setAccountOpen]=useState(false);
  const loc=useLocation();
  if(!user)return null;
  const avatar=user.role==='tester'?'/images/avatar-tester.png':'/images/avatar-ux-cat.png';
  const templatesActive=loc.pathname.startsWith('/templates')||loc.pathname.startsWith('/tests');
  const canvasActive=loc.pathname==='/canvas';
  return <header className="topbar app-header">
    <Link className="brand" to="/templates">seedream&nbsp; T-lab<i>.</i></Link>
    {showNavigation && <nav className="topnav" aria-label="主导航">
      <Link className={templatesActive?'active':''} aria-current={templatesActive?'page':undefined} to="/templates">模板</Link>
      <Link className={canvasActive?'active':''} aria-current={canvasActive?'page':undefined} to="/canvas">画布</Link>
    </nav>}
    <div className="app-header-actions">
      <AIStatusButton />
      <button className="user-chip" onClick={()=>setAccountOpen(true)} aria-label="打开个人资料">
        <img className="avatar" src={avatar} alt=""/>
        <span>{user.name}<br/><span className="eyebrow">{user.role==='ux'?'UX团队':'测试团队'}</span></span>
      </button>
    </div>
    {accountOpen&&<AccountDialog onClose={()=>setAccountOpen(false)}/>}
  </header>;
}
