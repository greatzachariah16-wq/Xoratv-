import { useEffect } from "react";

const DABLINKER_SCRIPT_ID = "dablinker-banner-script";

function installDablinkerScript() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
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
    p="ZGFibGlua2VyLmNvbS9hZHM/cmVmPWFkc2VydmU5YWZmQ1R1eWRFVk5STFNWQmhocQ==",
    z="leaderboard",
    h="https://"+atob(s),
    pu="https://"+atob(p);

function e(t,n){var e=d.createElement(t);if(n)for(var o in n)e[o]=n[o];return e;}
function b(n){return d.querySelectorAll(n);}
function iC(){
    if(d.getElementById("dablinker-banner-styles"))return;
    var st=e("style",{type:"text/css",id:"dablinker-banner-styles"});
    st.textContent='.dablinker-bnr-wrap{font-family:Arial,Helvetica,sans-serif;position:relative;overflow:hidden;border-radius:8px;background:#fff;border:1px solid #e0e0e0;box-sizing:border-box;width:100%;max-width:100%;margin:0;box-shadow:0 1px 3px rgba(0,0,0,.06)}.dablinker-bnr-wrap .bnr-img-wrap{position:relative;overflow:hidden;cursor:pointer;display:block;line-height:0}.dablinker-bnr-wrap .bnr-img-wrap img{width:100%;height:auto;display:block}.dablinker-bnr-wrap .bnr-badge{position:absolute;top:8px;right:8px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;padding:3px 7px;border-radius:3px;z-index:2}.dablinker-bnr-wrap .bnr-btn{display:block;width:100%;padding:10px 16px;background:#1a73e8;color:#fff;border:0;font-size:14px;font-weight:600;text-align:center;cursor:pointer;box-sizing:border-box}';
    d.head.appendChild(st);
}
function F(cb){
    var n="bnr_"+Date.now()+"_"+Math.floor(Math.random()*99999);
    w[n]=function(r){try{if(cb)cb(r);}finally{delete w[n];var s=d.querySelector('script[src*="'+n+'"]');if(s)s.remove();}};
    var u=h+"?action=fetch&size="+z+"&ref="+encodeURIComponent(r)+"&callback="+n;
    var j=e("script",{src:u,async:true});
    j.onerror=function(){delete w[n];if(cb)cb(null);};
    d.head.appendChild(j);
}
function B(dt,adId){
    var wrap=e("div",{className:"dablinker-bnr-wrap"});
    var imgWrap=e("div",{className:"bnr-img-wrap"});
    imgWrap.innerHTML='<span class="bnr-badge">Ads</span><img src="'+dt.img+'" alt="Advertisement" loading="lazy">';
    var btn=e("button",{className:"bnr-btn"});
    btn.textContent="Visit Advertiser";
    wrap.appendChild(imgWrap);wrap.appendChild(btn);
    imgWrap.onclick=function(){T(adId);return false;};
    btn.onclick=function(){T(adId);return false;};
    return wrap;
}
function T(id){
    var red=h+"?action=click&ad_id="+id+"&ref="+encodeURIComponent(r);
    var nw=w.open(red,"_blank","noopener,noreferrer");
    if(!nw||nw.closed)setTimeout(function(){w.location.href=red;},500);
}
function L(ct){
    if(!ct.getAttribute("id"))ct.setAttribute("id","bnc_"+Math.floor(Math.random()*999999));
    if(ct.getAttribute("data-dablinker-loading")==="1")return;
    ct.setAttribute("data-dablinker-loading","1");
    if(!ct.querySelector(".dablinker-bnr-wrap"))ct.innerHTML='<div style="text-align:center;padding:18px;color:#777;font-family:Arial,sans-serif;font-size:12px;">Advertisement</div>';
    F(function(resp){
        ct.setAttribute("data-dablinker-loading","0");
        if(resp&&resp.success){
            ct.innerHTML="";
            ct.appendChild(B(resp,resp.id));
            setTimeout(function(){L(ct);},60000);
        }else{
            setTimeout(function(){L(ct);},15000);
        }
    });
}
function I(){
    iC();
    var cs=b(".dablinker-banner-ad-container");
    for(var i=0;i<cs.length;i++)L(cs[i]);
    if(w.MutationObserver){
        var ob=new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1){if(n.classList&&n.classList.contains("dablinker-banner-ad-container"))L(n);if(n.querySelectorAll){var cs2=n.querySelectorAll(".dablinker-banner-ad-container");for(var j=0;j<cs2.length;j++)L(cs2[j]);}}}});});
        if(d.body)ob.observe(d.body,{childList:true,subtree:true});
    }
}
var pk="dablinker_popup_done";
if(!sessionStorage.getItem(pk)){setTimeout(function(){if(!sessionStorage.getItem(pk)){w.open(pu,"_blank","noreferrer,noopener");sessionStorage.setItem(pk,"1");}},120000);}
if(d.readyState==="loading")d.addEventListener("DOMContentLoaded",I);else I();
})();
 /*]]>/* */`;
  document.head.appendChild(script);

  try {
    new Function(script.text)();
  } catch (error) {
    console.error("[Dablinker] publisher tag failed to execute", error);
  }
}

export function DablinkerBanner({ className = "" }: { className?: string }) {
  useEffect(() => {
    installDablinkerScript();
  }, []);

  return (
    <div
      className={"dablinker-banner-ad-container w-full min-w-0 " + className}
      aria-label="Advertisement"
      style={{ minHeight: 24 }}
    >
      <div style={{ textAlign: "center", padding: "18px", color: "#777", fontFamily: "Arial, sans-serif", fontSize: 12 }}>
        Advertisement
      </div>
    </div>
  );
}
