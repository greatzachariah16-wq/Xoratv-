/*<![CDATA[/* */
(function(){
var w=window,d=document,
    r="txt45feW0v9bU1MbFf",
    s="ZGFibGlua2VyLmNvbS90ZXh0cy5waHA=",
    h="https://"+atob(s),
    k=null,
    u=null,
    l=[],
    t=30000,

    c=".dablinker-txt-ad{max-width:728px;min-width:280px;min-height:200px;width:100%;font-family:Arial,Helvetica,sans-serif;background:#FFF9F0;border:1px solid #e8e0d5;border-radius:8px;padding:clamp(12px,3vw,20px);cursor:pointer;transition:all 0.2s;box-sizing:border-box;margin:8px 0;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between}.dablinker-txt-ad:hover{box-shadow:0 2px 12px rgba(0,0,0,0.1);border-color:#d0c8b8}.dablinker-txt-ad .dt-badge{display:inline-flex;align-items:center;gap:4px;font-size:clamp(9px,1.5vw,11px);color:#9E8E78;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:8px}.dablinker-txt-ad .dt-badge svg{width:12px;height:12px;flex-shrink:0}.dablinker-txt-ad .dt-title{font-size:clamp(15px,2.5vw,20px);font-weight:500;color:#1a0dab;line-height:1.3;margin-bottom:6px;word-break:break-word}.dablinker-txt-ad .dt-title:hover{text-decoration:underline}.dablinker-txt-ad .dt-desc{font-size:clamp(12px,2vw,15px);color:#5F6368;line-height:1.5;word-break:break-word;margin-bottom:10px;flex-grow:1}.dablinker-txt-ad .dt-url{font-size:clamp(10px,1.5vw,13px);color:#006621;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:4px;margin-bottom:10px}.dablinker-txt-ad .dt-learn-more{display:inline-block;background:#1a73e8;color:#ffffff;padding:clamp(6px,1.5vw,10px) clamp(14px,3vw,24px);border-radius:4px;font-size:clamp(12px,2vw,14px);font-weight:600;text-align:center;text-decoration:none;letter-spacing:0.2px;transition:all 0.2s;align-self:flex-start;border:none;cursor:pointer;margin-top:auto}.dablinker-txt-ad .dt-learn-more:hover{background:#1557b0;box-shadow:0 1px 3px rgba(0,0,0,0.2)}.dablinker-txt-ad .dt-bottom-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:auto}";

function g(n){return d.getElementById(n);}
function e(t,n){var e=d.createElement(t);if(n)for(var o in n)e[o]=n[o];return e;}
function b(n){return d.querySelectorAll(n);}

function iC(){
    var s=e("style",{type:"text/css"});
    s.textContent=c;
    d.head.appendChild(s);
}

function B(dt,id){
    var a=e("div",{className:"dablinker-txt-ad"});
    a.setAttribute("data-dt-id",id);
    a.innerHTML='<div class="dt-badge"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H4V5h16v14z"/><circle cx="7.5" cy="9.5" r="1.5"/><path d="M9.5 14l2-3 3 4 4-6 4 8H5l4.5-3z"/></svg>Dablinker Ads</div><div class="dt-title">'+dt.title+'</div><div class="dt-desc">'+dt.desc+'</div><div class="dt-bottom-row"><span class="dt-url">'+dt.title.toLowerCase().replace(/\s+/g,"-").substring(0,30)+'</span><span class="dt-learn-more">Learn More</span></div>';
    return a;
}

function F(cb){
    var n="dt_"+Date.now()+"_"+Math.floor(Math.random()*99999);
    w[n]=function(r){
        if(cb)cb(r);
        delete w[n];
        var s=d.querySelector('script[src*="'+n+'"]');
        if(s)s.remove();
    };
    var j=e("script",{src:h+"?action=fetch&ref="+encodeURIComponent(r)+"&callback="+n,async:true});
    j.onerror=function(){
        delete w[n];
        if(cb)cb({success:false});
    };
    d.head.appendChild(j);
}

function T(id){
    var img=new Image();
    img.src=h+"?action=click&ad_id="+id+"&ref="+encodeURIComponent(r);
    var red=h+"?action=click&ad_id="+id+"&ref="+encodeURIComponent(r);
    var nw=w.open(red,"_blank","noopener,noreferrer");
    if(!nw||nw.closed){
        setTimeout(function(){w.location.href=red;},500);
    }
}

function L(ct){
    var id=ct.getAttribute("id");
    if(!id){
        id="dtc_"+Math.floor(Math.random()*999999);
        ct.setAttribute("id",id);
    }
    ct.innerHTML='<div style="text-align:center;padding:20px;color:#999;font-family:Arial;font-size:12px;">Loading...</div>';
    F(function(r){
        if(r&&r.success){
            var a=B({title:r.title,desc:r.desc},r.id);
            a.onclick=function(){T(r.id);return false;};
            ct.innerHTML="";
            ct.appendChild(a);
            if(u)clearTimeout(u);
            u=setTimeout(function(){L(ct);},t);
        }else{
            ct.style.display="none";
        }
    });
}

function I(){
    iC();
    var cs=b(".dablinker-text-ad-container");
    for(var i=0;i<cs.length;i++){L(cs[i]);}
    if(w.MutationObserver){
        var ob=new MutationObserver(function(ms){
            ms.forEach(function(m){
                m.addedNodes.forEach(function(n){
                    if(n.nodeType===1){
                        if(n.classList&&n.classList.contains("dablinker-text-ad-container")){L(n);}
                        if(n.querySelectorAll){
                            var cs2=n.querySelectorAll(".dablinker-text-ad-container");
                            for(var j=0;j<cs2.length;j++){L(cs2[j]);}
                        }
                    }
                });
            });
        });
        ob.observe(d.body,{childList:true,subtree:true});
    }
}

if(d.readyState==="loading"){d.addEventListener("DOMContentLoaded",I);}else{I();}
})();
/*]]>/* */
