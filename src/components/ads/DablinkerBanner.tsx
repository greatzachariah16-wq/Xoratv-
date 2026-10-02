import { useEffect, useRef } from "react";

const DABLINKER_SCRIPT_ID = "dablinker-banner-script";

function installDablinkerScript() {
  if (document.getElementById(DABLINKER_SCRIPT_ID)) return;

  const script = document.createElement("script");
  script.id = DABLINKER_SCRIPT_ID;
  script.type = "text/javascript";
  script.setAttribute("data-cfasync", "false");
  script.text = String.raw`/*<![CDATA[/* */
(function(){
var w=window,d=document,
    r="bnr45fKe9dyAynIHuG",
    s="ZGFibGlua2VyLmNvbS9iYW5uZXJzLnBocA==",
    f="aHR0cHM6Ly9kYWJsaW5rZXIuY29t",
    p="ZGFibGlua2VyLmNvbS9hZHM/cmVmPWFkc2VydmU5YWZmQ1R1eWRFVk5STFNWQmhocQ==",
    z="leaderboard",
    h="https://"+atob(s),
    pu="https://"+atob(p),
    k=null,
    t=60000,
    popupDone=false;

function e(t,n){var e=d.createElement(t);if(n)for(var o in n)e[o]=n[o];return e;}
function b(n){return d.querySelectorAll(n);}
function iC(){
    var st=e("style",{type:"text/css"});
    st.textContent='.dablinker-bnr-wrap{font-family:Arial,Helvetica,sans-serif;position:relative;overflow:hidden;border-radius:8px;background:#fff;border:1px solid #e0e0e0;box-sizing:border-box;width:100%;max-width:100%;margin:0;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:opacity 0.4s ease,transform 0.4s ease;opacity:1;transform:translateY(0)}.dablinker-bnr-wrap.bnr-exit{opacity:0;transform:translateY(12px);pointer-events:none}.dablinker-bnr-wrap.bnr-enter{opacity:0;transform:translateY(-12px);animation:bnrFadeIn 0.45s ease forwards}@keyframes bnrFadeIn{to{opacity:1;transform:translateY(0)}}.dablinker-bnr-wrap .bnr-img-wrap{position:relative;overflow:hidden;cursor:pointer;display:block;line-height:0}.dablinker-bnr-wrap .bnr-img-wrap img{width:100%;height:auto;display:block;transition:transform 0.3s ease}.dablinker-bnr-wrap .bnr-img-wrap:hover img{transform:scale(1.02)}.dablinker-bnr-wrap .bnr-badge{position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.55);color:#fff;font-size:10px;padding:3px 7px;border-radius:3px;z-index:2;font-family:Arial,sans-serif;letter-spacing:0.3px}.dablinker-bnr-wrap .bnr-btn{display:block;width:100%;padding:10px 16px;background:linear-gradient(180deg,#1a73e8,#1557b0);color:#fff;border:none;font-size:14px;font-weight:600;text-align:center;cursor:pointer;font-family:Arial,Helvetica,sans-serif;transition:background 0.2s,box-shadow 0.2s;letter-spacing:0.2px;border-radius:0 0 8px 8px;box-sizing:border-box}.dablinker-bnr-wrap .bnr-btn:hover{background:linear-gradient(180deg,#1c7af0,#165cc0);box-shadow:inset 0 1px 0 rgba(255,255,255,0.1)}.dablinker-bnr-wrap .bnr-btn:active{background:#1557b0;box-shadow:inset 0 2px 4px rgba(0,0,0,0.2)}@media(max-width:480px){.dablinker-bnr-wrap .bnr-btn{font-size:13px;padding:10px 14px}}';
    d.head.appendChild(st);
}
function F(cb){
    var n="bnr_"+Date.now()+"_"+Math.floor(Math.random()*99999);
    w[n]=function(r){if(cb)cb(r);delete w[n];var s=d.querySelector('script[src*="'+n+'"]');if(s)s.remove();};
    var u=h+"?action=fetch&size="+z+"&ref="+encodeURIComponent(r)+"&callback="+n;
    var j=e("script",{src:u,async:true});
    j.onerror=function(){delete w[n];if(cb)cb(null);};
    d.head.appendChild(j);
}
function B(dt,adId){
    var wrap=e("div",{className:"dablinker-bnr-wrap bnr-enter"});
    var imgWrap=e("div",{className:"bnr-img-wrap"});
    imgWrap.innerHTML='<span class="bnr-badge">Ads</span><img src="'+dt.img+'" alt="Advertisement" loading="lazy">';
    var btn=e("button",{className:"bnr-btn"});
    btn.textContent="Visit Advertiser";
    wrap.appendChild(imgWrap);wrap.appendChild(btn);
    imgWrap.onclick=function(){T(adId);return false;};btn.onclick=function(){T(adId);return false;};
    return wrap;
}
function T(id){
    var red=h+"?action=click&ad_id="+id+"&ref="+encodeURIComponent(r);
    var nw=w.open(red,"_blank","noopener,noreferrer");
    if(!nw||nw.closed)setTimeout(function(){w.location.href=red;},500);
}
function swapAd(ct,newWrap){
    var oldAd=ct.querySelector(".dablinker-bnr-wrap");
    if(oldAd){
        oldAd.classList.add("bnr-exit");oldAd.classList.remove("bnr-enter");
        setTimeout(function(){if(ct.contains(oldAd))ct.removeChild(oldAd);ct.appendChild(newWrap);var fresh=ct.querySelector(".dablinker-bnr-wrap");if(fresh)fresh.classList.add("bnr-enter");},400);
    }else{ct.innerHTML="";ct.appendChild(newWrap);var fresh=ct.querySelector(".dablinker-bnr-wrap");if(fresh)fresh.classList.add("bnr-enter");}
}
function L(ct){
    if(!ct.getAttribute("id"))ct.setAttribute("id","bnc_"+Math.floor(Math.random()*999999));
    if(!ct.querySelector(".dablinker-bnr-wrap"))ct.innerHTML='<div style="text-align:center;padding:24px;color:#999;font-family:Arial;font-size:13px;">Loading Ads...</div>';
    F(function(r){
        if(r&&r.success){
            var newWrap=B(r,r.id),old=ct.querySelector(".dablinker-bnr-wrap");
            if(old)swapAd(ct,newWrap);else{ct.innerHTML="";ct.appendChild(newWrap);}
            if(k)clearTimeout(k);k=setTimeout(function(){L(ct);},t);
        }else{ct.style.display="none";}
    });
}
function I(){
    iC();
    var cs=b(".dablinker-banner-ad-container");
    for(var i=0;i<cs.length;i++)L(cs[i]);
    if(w.MutationObserver){
        var ob=new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1){if(n.classList&&n.classList.contains("dablinker-banner-ad-container"))L(n);if(n.querySelectorAll){var cs2=n.querySelectorAll(".dablinker-banner-ad-container");for(var j=0;j<cs2.length;j++)L(cs2[j]);}}}});});
        ob.observe(d.body,{childList:true,subtree:true});
    }
}
var pk="dablinker_popup_done";
if(!sessionStorage.getItem(pk)){setTimeout(function(){if(!popupDone&&!sessionStorage.getItem(pk)){popupDone=true;w.open(pu,"_blank","noreferrer,noopener");sessionStorage.setItem(pk,"1");}},120000);}
if(d.readyState==="loading")d.addEventListener("DOMContentLoaded",I);else I();
})();
/*]]>/* */`;
  document.head.appendChild(script);
}

export function DablinkerBanner({ className = "" }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    installDablinkerScript();
  }, []);

  return (
    <div
      ref={containerRef}
      className={"dablinker-banner-ad-container w-full min-w-0 " + className}
      aria-label="Advertisement"
    />
  );
}
