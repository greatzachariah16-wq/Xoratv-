import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type TouchEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen, Check, Clapperboard, FileText, Info, Landmark, Loader2,
  Menu, PenLine, Plus, Radio, Settings2, Trash2, Upload, Users, ImagePlus,
  X, AlertTriangle,
} from "lucide-react";
import { AppShell } from "@/components/xora/AppShell";
import { UserAvatar } from "@/components/xora/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { commerceFetch, creatorDashboardQuery } from "@/lib/commerce";
import { profilePostsQuery } from "@/lib/api";
import { CourseCreatorForm } from "@/components/xora/CourseCreatorForm";
import { EditChannelSheet, type Channel, type ChannelUpdate } from "@/components/xora/EditChannelSheet";
import { ChannelHeader } from "@/components/xora/ChannelHeader";
import { ChannelTabs, type TabId } from "@/components/xora/ChannelTabs";
import { StudioSheet, type StudioTabId } from "@/components/xora/StudioSheet";
import { EmptyState } from "@/components/xora/EmptyState";
import { PayoutBankModal } from "@/components/xora/PayoutBankModal";
import { HowItWorks, InviteLinkCard, ReferralList, ReferralStats, type ReferralMember } from "@/components/xora/CreatorReferral";

export const Route = createFileRoute("/creator-studio")({ component: ChannelPage });

type Section=TabId|"videos"|"manage"|"analytics"|"earnings"|"referrals"|"payout"|"customize";

function ChannelPage(){
  const {user,profile}=useAuth();
  const [section,setSection]=useState<Section>(()=>typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("createCourse")==="1"?"manage":"shorts");
  const [showCourseCreator,setShowCourseCreator]=useState(()=>typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("createCourse")==="1");
  const [menuOpen,setMenuOpen]=useState(false);
  const [editOpen,setEditOpen]=useState(false);
  const [optimisticChannel,setOptimisticChannel]=useState<ChannelUpdate|null>(null);
  const touchStart=useRef<{x:number;y:number}|null>(null);
  const [registered,setRegistered]=useState(false);
  const [terms,setTerms]=useState(false);
  const [busy,setBusy]=useState(false);
  const [deleteTarget,setDeleteTarget]=useState<any>(null);
  const [deleteBusy,setDeleteBusy]=useState(false);
  const [payoutRequestBusy,setPayoutRequestBusy]=useState("");
  const [bankOpen,setBankOpen]=useState(false);
  const [linkBusy,setLinkBusy]=useState(false);
  const [referralLinkBusy,setReferralLinkBusy]=useState(false);
  const [referralUrl,setReferralUrl]=useState("");
  const [featuredBusy,setFeaturedBusy]=useState(false);
  const [featuredError,setFeaturedError]=useState("");
  const [featuredPreview,setFeaturedPreview]=useState("");
  const [channelBio,setChannelBio]=useState("");
  const [featuredTitle,setFeaturedTitle]=useState("Your channel. Your stories.");
  const [featuredDescription,setFeaturedDescription]=useState("Make your best work the first thing people discover on XoraTV.");
  const [showCourses,setShowCourses]=useState(true);
  const [showCommunity,setShowCommunity]=useState(true);
  const [customizeBusy,setCustomizeBusy]=useState(false);
  const {data,isPending,refetch}=useQuery(creatorDashboardQuery(user?.id));
  const {data:profilePosts=[]}=useQuery(profilePostsQuery(user?.id));
  // All hooks must run on every render. Keeping this effect before any
  // conditional return prevents React's "Rendered more hooks" crash when
  // authentication finishes after the first render.
  const dashboard=data?.dashboard;
  const creatorInfo=dashboard?.creator;
  const displayName=optimisticChannel?.displayName||profile?.display_name||creatorInfo?.displayName||user?.displayName||"Xora Creator";
  const publicBio=optimisticChannel?optimisticChannel.bio:(channelBio||profile?.bio||creatorInfo?.channelBio||"Creator on XoraTV");
  const publicFeaturedTitle=creatorInfo?.featuredTitle||"Your channel. Your stories.";
  const publicFeaturedDescription=creatorInfo?.featuredDescription||"Make your best work the first thing people discover on XoraTV.";
  const username=optimisticChannel?.handle||profile?.username||creatorInfo?.username||user?.email?.split("@")[0]||"creator";
  const avatar=optimisticChannel?.avatarUrl||profile?.avatar_url||user?.photoURL||"";
  const courses=dashboard?.courses||[];
  const savedReferralLink=(dashboard?.links||[]).find((link:any)=>link.service==="data-reward");
  const referralShareUrl=referralUrl||(savedReferralLink&&typeof window!=="undefined"?window.location.origin+"/s/"+savedReferralLink.token:"");
  const publishedCourses=courses.filter((c:any)=>c.status==="published");
  const shorts=dashboard?.shorts||[];
  const textPosts=profilePosts.filter((post:any)=>post.kind==="text" && post.status==="published").sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
  const isOwner=Boolean(user && (creatorInfo || registered));
  const followerCount=Number(dashboard?.stats?.followers||0);
  const followerLabel=followerCount===0?"New channel":new Intl.NumberFormat(undefined,{notation:"compact",maximumFractionDigits:1}).format(followerCount)+" followers";
  const coverUrl=optimisticChannel?.bannerUrl||String(dashboard?.creator?.coverImageUrl||dashboard?.creator?.featuredImageUrl||"");

  useEffect(()=>{ if(!creatorInfo)return; setChannelBio(creatorInfo.channelBio||""); setFeaturedTitle(creatorInfo.featuredTitle||"Your channel. Your stories."); setFeaturedDescription(creatorInfo.featuredDescription||"Make your best work the first thing people discover on XoraTV."); setShowCourses(creatorInfo.showCourses!==false); setShowCommunity(creatorInfo.showCommunity!==false); },[creatorInfo]);
  useEffect(()=>{ if(section==="earnings"||section==="referrals") void refetch(); },[section,refetch]);
  useEffect(()=>{document.documentElement.classList.add("xora-channel-route");return ()=>document.documentElement.classList.remove("xora-channel-route");},[]);


  if(!user)return <AppShell wide><div className="mx-auto max-w-3xl rounded-[30px] border border-border bg-surface p-10 text-center shadow-card"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Radio className="size-7"/></div><h1 className="mt-5 font-display text-3xl font-semibold">X Channel</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">Sign in to create and manage your XoraTV creator channel.</p><Link to="/auth" className="mt-6 inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Sign in</Link></div></AppShell>;

  async function saveCustomization(){ setCustomizeBusy(true); try{ await commerceFetch("/api/commerce/creator/customization",{method:"POST",body:JSON.stringify({userId:user.id,channelBio,featuredTitle,featuredDescription,showCourses,showCommunity})}); await refetch(); }catch(e){alert(e instanceof Error?e.message:"Could not save channel customization.");}finally{setCustomizeBusy(false);} }

  async function register(){
    setBusy(true);
    try{
      await commerceFetch("/api/commerce/creator/register",{method:"POST",body:JSON.stringify({userId:user.id,displayName,username})});
      setRegistered(true); await refetch();
    }catch(e){alert(e instanceof Error?e.message:"Channel registration failed.");}
    finally{setBusy(false);}
  }

  async function deleteCourse(){
    if(!deleteTarget)return;
    setDeleteBusy(true);
    try{
      await commerceFetch("/api/commerce/creator/course",{method:"DELETE",body:JSON.stringify({creatorId:user.id,courseId:deleteTarget.id})});
      setDeleteTarget(null); await refetch();
    }catch(e){alert(e instanceof Error?e.message:"Could not delete course.");}
    finally{setDeleteBusy(false);}
  }

  async function deleteShort(){
    if(!deleteTarget)return;
    setDeleteBusy(true);
    try{
      await commerceFetch("/api/commerce/creator/short",{method:"DELETE",body:JSON.stringify({creatorId:user.id,postId:deleteTarget.id})});
      setDeleteTarget(null); await refetch();
    }catch(e){alert(e instanceof Error?e.message:"Could not delete Short.");}
    finally{setDeleteBusy(false);}
  }

  async function createOfferLink(){
    setLinkBusy(true);
    try{await commerceFetch("/api/offers/creator-link",{method:"POST",body:JSON.stringify({creatorId:user.id})});await refetch();}
    catch(e){alert(e instanceof Error?e.message:"Could not create your offer link.");}
    finally{setLinkBusy(false);}
  }

  async function createDataRewardReferralLink(){
    setReferralLinkBusy(true);
    try{
      const result=await commerceFetch<{link:{token:string}}>("/api/commerce/creator/data-reward-link",{method:"POST",body:JSON.stringify({})});
      setReferralUrl(window.location.origin+"/s/"+result.link.token);
      await refetch();
    }catch(e){alert(e instanceof Error?e.message:"Could not create your Xora sign-up referral link.");}
    finally{setReferralLinkBusy(false);}
  }

  async function uploadFeaturedImage(file: File){
    setFeaturedError("");
    if (!["image/jpeg","image/png","image/webp"].includes(file.type)) {
      setFeaturedError("Use JPG, PNG or WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFeaturedError("Featured image must be 5MB or smaller.");
      return;
    }
    const dimensions = await new Promise<{width:number;height:number}|null>((resolve)=>{
      const image = new Image();
      image.onload=()=>{resolve({width:image.naturalWidth,height:image.naturalHeight}); URL.revokeObjectURL(image.src);};
      image.onerror=()=>{resolve(null); URL.revokeObjectURL(image.src);};
      image.src=URL.createObjectURL(file);
    });
    if (!dimensions || dimensions.width !== 1920 || dimensions.height !== 1080) {
      setFeaturedError("Featured image must be exactly 1920 × 1080 pixels (16:9).");
      return;
    }
    const previewUrl=URL.createObjectURL(file);
    setFeaturedPreview(previewUrl);
    setFeaturedBusy(true);
    try{
      const form=new FormData();
      form.append("file",file);
      form.append("bucket","channel-featured");
      form.append("userId",user.id);
      const uploadRes=await fetch("/api/upload",{method:"POST",body:form});
      const uploadBody=await uploadRes.json().catch(()=>null);
      if(!uploadRes.ok || !uploadBody?.ok || !uploadBody?.url) throw new Error(uploadBody?.error||"Image upload failed.");
      await commerceFetch("/api/commerce/creator/featured-image",{method:"POST",body:JSON.stringify({userId:user.id,featuredImageUrl:uploadBody.url})});
      await refetch();
    }catch(e){
      setFeaturedPreview("");
      setFeaturedError(e instanceof Error?e.message:"Could not save Featured image.");
    }finally{setFeaturedBusy(false);}
  }

  async function savePayout(details:{accountName:string;accountNumber:string;bankName:string}){
    await commerceFetch("/api/commerce/creator/payout",{method:"POST",body:JSON.stringify(details)});
    await refetch();
  }

  async function requestCreatorPayout(payoutType:"referral"){
    setPayoutRequestBusy(payoutType);
    try{
      await commerceFetch("/api/commerce/creator/payout-request",{method:"POST",body:JSON.stringify({payoutType})});
      await refetch();
      alert("Your payout request has been sent to the XoraTV admin team.");
    }catch(e){alert(e instanceof Error?e.message:"Could not submit payout request.");}
    finally{setPayoutRequestBusy("");}
  }

  if(isPending)return <AppShell wide><div className="xora-channel-page space-y-4" aria-busy="true" aria-label="Loading channel"><section className="xora-channel-hero"><div className="xora-channel-cover xora-channel-skeleton"/><div className="xora-channel-identity"><div className="xora-channel-avatar-skeleton"/><div className="min-w-0 flex-1 space-y-3"><div className="xora-channel-skeleton h-7 w-2/3 rounded-xl"/><div className="xora-channel-skeleton h-4 w-1/3 rounded-lg"/><div className="xora-channel-skeleton h-4 w-1/2 rounded-lg"/></div></div><div className="xora-channel-tabs-skeleton"><span/><span/><span/><span/></div></section><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[1,2,3].map(i=><div key={i} className="overflow-hidden rounded-2xl border border-border bg-surface p-2"><div className="xora-channel-skeleton aspect-[9/16] rounded-xl"/><div className="xora-channel-skeleton mt-3 h-4 w-3/4 rounded-lg"/><div className="xora-channel-skeleton mt-2 h-3 w-1/2 rounded-lg"/></div>)}</div></div></AppShell>;

  if(!creatorInfo&&!registered)return <AppShell wide>
    <div className="mx-auto max-w-5xl grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
      <section className="relative overflow-hidden rounded-[32px] border border-border bg-surface p-7 shadow-card sm:p-9">
        <div className="absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl"/>
        <div className="relative">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Radio className="size-6"/></div>
          <p className="mt-7 text-xs font-semibold uppercase tracking-[.2em] text-primary">XoraTV creator network</p>
          <h1 className="mt-2 max-w-2xl font-display text-4xl font-semibold tracking-tight">Build your own X Channel.</h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">Publish videos, Shorts and courses, grow subscribers, build a media identity and earn from eligible XoraTV activity.</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-background p-4"><Radio className="size-4 text-primary"/><p className="mt-3 text-sm font-semibold">Publish</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Turn your content into a real channel.</p></div>
            <div className="rounded-2xl border border-border bg-background p-4"><Users className="size-4 text-primary"/><p className="mt-3 text-sm font-semibold">Grow</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Build subscribers around your media brand.</p></div>
            <div className="rounded-2xl border border-border bg-background p-4"><Users className="size-4 text-primary"/><p className="mt-3 text-sm font-semibold">Earn</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Creators earn ₦100 once when a referred member completes a successful paid subscription. Commissions stay pending for 7 days.</p></div>
          </div>
        </div>
      </section>
      <section className="rounded-[32px] border border-border bg-surface p-7 shadow-card sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Get started</p>
        <h2 className="mt-2 font-display text-2xl font-semibold">Create your X Channel</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Your channel is separate from your personal XoraTV profile, but uses the same signed-in account.</p>
        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-background p-4"><input type="checkbox" checked={terms} onChange={e=>setTerms(e.target.checked)} className="mt-0.5 size-4 accent-primary"/><span className="text-xs leading-5 text-muted-foreground">I agree to the X Channel creator terms and understand that creator activity may be reviewed by XoraTV.</span></label>
        <button onClick={()=>void register()} disabled={!terms||busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy?<Loader2 className="size-4 animate-spin"/>:<Radio className="size-4"/>}{busy?"Creating channel…":"Create X Channel"}</button>
      </section>
    </div>
  </AppShell>;

  const publicTabs:Array<[TabId,string]>=[["shorts","Shorts"],...(showCourses?[["courses","Courses"] as [TabId,string]]:[]),["posts","Posts"],["about","About"]];
  const manageTabs:Array<[StudioTabId,string]>=[["manage","Overview"],["analytics","Analytics"],["earnings","Earnings"],["referrals","Referrals"],["payout","Payout details"],["customize","Customize"]];

  function PublicContent(){
    if(section==="shorts")return shorts.length?<section className="space-y-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-primary">Channel Shorts</p><h2 className="mt-1 font-display text-2xl font-semibold">Published Shorts</h2><p className="mt-1 text-xs text-muted-foreground">Shorts published by this X Channel.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{shorts.map((post:any)=><article key={post.id} className="overflow-hidden rounded-[22px] border border-border bg-surface shadow-card"><div className="aspect-[9/16] max-h-[420px] bg-black"><video src={post.stream_url||post.media_path||""} poster={post.poster_path||undefined} controls playsInline preload="metadata" className="size-full object-contain"/></div><div className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{post.title||"Untitled Short"}</p><p className="mt-1 text-[11px] text-muted-foreground">{post.views_count||0} views</p></div><button onClick={()=>setDeleteTarget({...post,_type:"short"})} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-destructive/20 px-2.5 py-2 text-[10px] font-semibold text-destructive hover:bg-destructive/10" aria-label="Delete Short"><Trash2 className="size-3.5"/>Delete</button></div></article>)}</div></section>:<EmptyState icon={Clapperboard} title={isOwner?"Share your first Short":"No Shorts yet"} description={isOwner?"Upload a video and start building your audience.":"Check back soon."} action={isOwner?<Link to="/create" className="xora-channel-empty-action"><Upload className="size-4"/>Upload Short</Link>:undefined}/>;
    if(section==="posts")return textPosts.length?<section className="space-y-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-primary">Channel Posts</p><h2 className="mt-1 font-display text-2xl font-semibold">Thoughts & updates</h2><p className="mt-1 text-xs text-muted-foreground">Text posts published by this creator.</p></div><div className="space-y-3">{textPosts.map((post:any)=><article key={post.id} className="rounded-[22px] border border-border bg-surface p-5 shadow-card"><div className="flex items-center gap-3"><UserAvatar path={avatar} name={displayName} size={38}/><div><p className="text-sm font-semibold">{displayName}</p><p className="text-[10px] text-muted-foreground">{new Date(post.created_at||Date.now()).toLocaleDateString()}</p></div></div>{post.title?<h3 className="mt-4 text-base font-semibold">{post.title}</h3>:null}{post.poster_path?<img src={post.poster_path} alt={post.title||"Creator post"} loading="lazy" className="mt-4 aspect-[4/3] w-full rounded-2xl object-cover"/>:null}<p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground/85">{post.caption||" "}</p><div className="mt-4 flex items-center gap-4 text-[10px] text-muted-foreground"><span>{post.likes_count||0} likes</span><span>{post.comments_count||0} comments</span></div></article>)}</div></section>:<section className="xora-channel-empty"><div className="xora-channel-empty-icon"><FileText className="size-6"/></div><h2>{isOwner?"Share your first post":"No posts yet"}</h2><p>{isOwner?"Share an update with the people who follow your channel.":"Check back soon."}</p>{isOwner?<Link to="/create" className="xora-channel-empty-action"><PenLine className="size-4"/>Create post</Link>:null}</section>;
    if(section==="about")return <section className="rounded-2xl border border-border bg-surface p-6 shadow-card"><div className="mb-3 flex items-center gap-2 text-primary"><Info className="size-4"/><p className="text-xs font-semibold uppercase tracking-[.16em]">About this channel</p></div><h2 className="mt-2 font-display text-xl font-semibold">{displayName}</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{publicBio||"Welcome to my XoraTV channel."}</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><Stat label="Subscribers" value={String((dashboard?.creator as any)?.subscriber_count||0)}/><Stat label="Courses" value={String(publishedCourses.length)}/><Stat label="Joined" value="XoraTV"/></div></section>;
    if(section==="courses" && showCourses)return <CourseShelf courses={publishedCourses} isOwner={isOwner}/>;
    return <div className="space-y-8">
      <section className="grid gap-4 lg:grid-cols-[1.65fr_.75fr]">
        <article className="group relative aspect-video w-full overflow-hidden rounded-[26px] bg-ink text-white shadow-lift">
          {dashboard?.creator?.featuredImageUrl||featuredPreview
            ? <img src={featuredPreview||dashboard.creator.featuredImageUrl} alt="" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.015]"/>
            : <div className="absolute inset-0 bg-gradient-to-br from-primary/75 via-ink to-foreground"/>
          }
          <div className="absolute inset-0 bg-gradient-to-br from-black/10 via-black/10 to-black/75"/>
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 to-transparent"/>
          <label className="absolute right-4 top-4 z-10 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-[10px] font-semibold backdrop-blur-md transition hover:bg-black/50">
            {featuredBusy?<Loader2 className="size-3.5 animate-spin"/>:<ImagePlus className="size-3.5"/>}
            {featuredBusy?"Uploading…":"Change image"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={featuredBusy} onChange={e=>{const file=e.target.files?.[0]; if(file) void uploadFeaturedImage(file); e.currentTarget.value="";}}/>
          </label>
          <div className="relative flex size-full min-h-0 flex-col justify-end p-4 sm:p-8 lg:p-9">
            <span className="w-fit rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[.2em] backdrop-blur">Featured</span>
            <h2 className="mt-2 max-w-[15rem] text-xl font-semibold leading-[1.05] tracking-tight sm:mt-4 sm:max-w-xl sm:text-3xl lg:text-4xl">{publicFeaturedTitle}</h2>
            <p className="mt-1.5 max-w-[18rem] text-[10px] leading-4 text-white/70 sm:mt-2 sm:max-w-md sm:text-xs sm:leading-5">{publicFeaturedDescription}</p>
            <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-5 sm:gap-2">
              <Link to="/create" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[10px] font-semibold text-foreground sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-xs"><Upload className="size-3.5"/> Publish content</Link>
              <button onClick={()=>setSection("shorts")} className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-semibold backdrop-blur sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-xs">View Shorts</button>
            </div>
            {featuredError?<p className="mt-3 text-[10px] font-medium text-red-200">{featuredError}</p>:null}
          </div>
        </article>
        <aside className="flex flex-col justify-between rounded-[26px] border border-border bg-surface p-6 shadow-card">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-primary">Channel note</p>
            <h3 className="mt-2 font-display text-xl font-semibold">Your creator space.</h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Shorts, courses and text posts live together under one X Channel identity.</p>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-2">
            <Stat label="Followers" value={Number(dashboard?.stats?.followers||0).toLocaleString()}/>
            <Stat label="Courses" value={String(publishedCourses.length)}/>
          </div>
        </aside>
      </section>
      <section>
        <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-primary">Learning</p><h2 className="mt-1 font-display text-2xl font-semibold">Courses</h2></div><button onClick={()=>setSection("courses")} className="text-xs font-semibold text-primary">View all</button></div>
        <CourseShelf courses={publishedCourses.slice(0,4)}/>
      </section>
      <section>
        <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-primary">Posts</p><h2 className="mt-1 font-display text-2xl font-semibold">Latest thoughts</h2></div><button onClick={()=>setSection("posts")} className="text-xs font-semibold text-primary">View all</button></div>
        {textPosts.slice(0,2).map((post:any)=><article key={post.id} className="mt-3 rounded-2xl border border-border bg-surface p-4 shadow-sm"><p className="whitespace-pre-wrap text-sm leading-6">{post.caption}</p><p className="mt-3 text-[10px] text-muted-foreground">{new Date(post.created_at||Date.now()).toLocaleDateString()}</p></article>)}
        {!textPosts.length?<div className="mt-3 rounded-2xl border border-dashed border-border bg-surface p-6 text-center text-xs text-muted-foreground">No text posts yet.</div>:null}
      </section>
    </div>;
  }

  function ManageContent(){
    if(section==="analytics")return <section className="space-y-4"><PanelTitle eyebrow="Channel analytics" title="Know what your audience watches" text="Only live metrics available to XoraTV are shown here."/><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Subscribers" value={dashboard?.stats?.followers||0}/><Metric label="Published courses" value={publishedCourses.length}/><Metric label="Paid referrals" value={dashboard?.referralEarnings?.successfulReferrals||0}/><Metric label="Referral activity rule" value="1 + 3 claims"/></div></section>;
    if(section==="earnings")return <section className="space-y-4">
      <PanelTitle eyebrow="X Channel finance" title="Creator earnings" text="Referral commissions are created only after a verified VAS subscription payment. Each commission is held for 7 days before becoming eligible."/>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card"><p className="text-xs text-muted-foreground">Eligible earnings</p><p className="mt-2 text-2xl font-semibold tabular-nums">₦{Number(dashboard?.referralEarnings?.balance||0).toLocaleString("en-NG")}</p></div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card"><p className="text-xs text-muted-foreground">Pending · 7-day hold</p><p className="mt-2 text-2xl font-semibold tabular-nums">₦{Number(dashboard?.referralEarnings?.pendingBalance||0).toLocaleString("en-NG")}</p></div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card"><p className="text-xs text-muted-foreground">Successful paid referrals</p><p className="mt-2 text-2xl font-semibold tabular-nums">{Number(dashboard?.referralEarnings?.successfulReferrals||0).toLocaleString()}</p></div>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-semibold">How referral earnings work</h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Your existing invite link stays the same. A referral earns ₦100 once after the member's first successful paid VAS subscription is confirmed. That commission remains pending for 7 days, then moves into your eligible balance. Sign-ups and free-data claims do not create commissions.</p>
      </div>
    </section>;
    if(section==="referrals")return <section className="w-full min-w-0 max-w-full space-y-4">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight">Invite friends</h2>
        <p className="mt-1 max-w-[60ch] break-words text-xs leading-5 text-muted-foreground">Share your link and earn ₦100 once when a referred friend completes their first paid subscription.</p>
      </div>
      <InviteLinkCard url={referralShareUrl} busy={referralLinkBusy} onCreate={()=>void createDataRewardReferralLink()}/>
      <ReferralStats
        visits={Number(dashboard?.referralTracking?.clicks||0)}
        pending={Number(dashboard?.referralTracking?.pending||0)}
        eligible={Number(dashboard?.referralTracking?.eligible||0)}
        earned={"₦"+Number(dashboard?.referralEarnings?.balance||0).toLocaleString("en-NG")}
        activeMembers={Number(dashboard?.referralEarnings?.activeAudience||0)}
      />
      <ReferralList pending={(dashboard?.referralTracking?.pendingMembers||[]) as ReferralMember[]} eligible={(dashboard?.referralTracking?.eligibleMembers||[]) as ReferralMember[]}/>
      <HowItWorks/>
    </section>;
    if(section==="payout"){
      const referralBalance=Number(dashboard?.referralEarnings?.balance||0);
      const requests=dashboard?.payoutRequests||[];
      return <section className="space-y-4">
        <PanelTitle eyebrow="Creator finance" title="Creator payouts" text="Manage your receiving bank account and request payment from eligible creator earnings."/>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-card"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Landmark className="size-5"/></span><div><h3 className="text-sm font-semibold">Payout bank account</h3><p className="mt-1 text-xs text-muted-foreground">Your saved details are visible to the XoraTV admin team.</p></div></div><PayoutForm/></div>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-card"><PanelTitle eyebrow="Creator withdrawal centre" title="Request a payout" text="Choose which creator earnings you want to withdraw. The system checks your available balance and minimum before accepting the request."/>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background p-4"><div className="flex items-center justify-between"><span className="text-sm font-semibold">Referral payout</span><Users className="size-5 text-primary"/></div><p className="mt-3 text-2xl font-semibold tabular-nums">₦{referralBalance.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Minimum ₦500 · Nigerian Naira</p><button type="button" onClick={()=>void requestCreatorPayout("referral")} disabled={!!payoutRequestBusy||referralBalance<500||!dashboard?.payout?.bankName} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45">{payoutRequestBusy==="referral"?<Loader2 className="size-4 animate-spin"/>:null}Request referral payout</button></div>
            
          </div>
          <div className="mt-5 border-t border-border pt-4"><h3 className="text-sm font-semibold">Your payout requests</h3>{requests.length?<div className="mt-3 space-y-2">{requests.map((item:any)=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"><div><p className="text-sm font-semibold">{item.payoutType==="referral"?"VAS referral payout":"Legacy payout"} · {item.currency==="NGN"?"₦":"$"}{Number(item.amount).toLocaleString()}</p><p className="mt-1 text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p></div><span className="rounded-full border border-border px-3 py-1 text-xs font-semibold capitalize">{item.status}</span></div>)}</div>:<p className="mt-2 text-xs text-muted-foreground">No payout requests yet.</p>}</div>
        </div>
      </section>;
    }
    if(section==="customize")return <section className="space-y-4"><PanelTitle eyebrow="Channel customization" title="Make your X Channel yours" text="Control the identity, Featured message and sections your audience sees."/><div className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-border bg-surface p-5 shadow-card"><Settings2 className="size-5 text-primary"/><p className="mt-3 text-sm font-semibold">Channel identity</p><label className="mt-4 block text-xs font-medium">Channel description</label><textarea value={channelBio} onChange={e=>setChannelBio(e.target.value)} maxLength={280} rows={4} placeholder="Tell viewers what your channel is about…" className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"/><p className="mt-1 text-[10px] text-muted-foreground">{channelBio.length}/280</p><p className="mt-3 text-xs text-muted-foreground">Name: {displayName} · Handle: @{username}</p><Link to={`/profile/$username`} params={{username}} className="mt-3 inline-flex text-xs font-semibold text-primary">Edit profile photo →</Link></div><div className="rounded-2xl border border-border bg-surface p-5 shadow-card"><PenLine className="size-5 text-primary"/><p className="mt-3 text-sm font-semibold">Featured section</p><label className="mt-4 block text-xs font-medium">Headline</label><input value={featuredTitle} onChange={e=>setFeaturedTitle(e.target.value)} maxLength={100} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"/><label className="mt-3 block text-xs font-medium">Supporting text</label><textarea value={featuredDescription} onChange={e=>setFeaturedDescription(e.target.value)} maxLength={240} rows={3} className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"/><p className="mt-2 text-[10px] text-muted-foreground">Your Featured image stays 1920 × 1080 and appears at the top of your channel.</p></div></div><div className="rounded-2xl border border-border bg-surface p-5 shadow-card"><p className="text-sm font-semibold">Channel sections</p><p className="mt-1 text-xs text-muted-foreground">Choose which shelves are visible to viewers.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="flex items-center justify-between rounded-xl border border-border p-3 text-xs"><span><b className="block">Courses</b><span className="text-muted-foreground">Show the Courses section</span></span><input type="checkbox" checked={showCourses} onChange={e=>setShowCourses(e.target.checked)} className="size-4 accent-primary"/></label><label className="flex items-center justify-between rounded-xl border border-border p-3 text-xs"><span><b className="block">Community</b><span className="text-muted-foreground">Show the Community section</span></span><input type="checkbox" checked={showCommunity} onChange={e=>setShowCommunity(e.target.checked)} className="size-4 accent-primary"/></label></div></div><button onClick={saveCustomization} disabled={customizeBusy} className="sticky bottom-3 z-20 mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg ring-1 ring-primary/20 transition active:scale-[.99] disabled:opacity-50 sm:static sm:mt-0 sm:w-auto sm:justify-start sm:px-4 sm:py-2.5 sm:text-xs">{customizeBusy?<Loader2 className="size-4 animate-spin"/>:<Check className="size-4"/>}{customizeBusy?"Saving…":"Save customization"}</button></section>;
    return <div className="space-y-4"><PanelTitle eyebrow="Manage channel" title="Your creator workspace" text="Everything you need to publish and grow your X Channel."/><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4"><div><p className="text-sm font-semibold">Course publishing</p><p className="mt-1 text-xs text-muted-foreground">Only your active X Channel can publish courses.</p></div><button onClick={()=>setShowCourseCreator(v=>!v)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground"><Plus className="size-3.5"/>{showCourseCreator?"Close creator":"Create course"}</button></div>{showCourseCreator?<CourseCreatorForm onPublished={()=>{setShowCourseCreator(false);void refetch();}} onCancel={()=>setShowCourseCreator(false)}/>:null}<section className="rounded-2xl border border-border bg-surface p-5 shadow-card"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">Your Shorts</p><h3 className="mt-1 font-display text-lg font-semibold">Published creator videos</h3><p className="mt-1 text-[11px] text-muted-foreground">Only Shorts owned by this creator are shown here.</p></div><Link to="/create" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"><Plus className="size-3.5"/>Upload</Link></div>{shorts.length?<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{shorts.map((post:any)=><div key={post.id} className="overflow-hidden rounded-2xl border border-border bg-background"><div className="aspect-video bg-black"><video src={post.stream_url||post.media_path||""} poster={post.poster_path||undefined} controls playsInline preload="metadata" className="size-full object-contain"/></div><div className="flex items-center gap-3 p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{post.title||"Untitled Short"}</p><p className="mt-1 text-[10px] text-muted-foreground">{new Date(post.created_at||Date.now()).toLocaleDateString()} · {post.views_count||0} views</p></div><button onClick={()=>setDeleteTarget({...post,_type:"short"})} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-destructive" aria-label="Delete Short"><Trash2 className="size-4"/></button></div></div>)}</div>:<p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No Shorts published yet. Upload your first creator Short.</p>}</section><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Action icon={<Upload/>} title="Upload video" text="Publish long-form content" href="/create"/><Action icon={<Radio/>} title="Manage Shorts" text="Open your Shorts feed" href="/shorts"/><Action icon={<BookOpen/>} title="Create course" text="Teach through video lessons" onClick={()=>{setSection("manage");setShowCourseCreator(true);}}/></div><section className="rounded-2xl border border-border bg-surface p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">Courses</p><h3 className="mt-1 font-display text-lg font-semibold">Your learning catalogue</h3></div><button onClick={()=>setShowCourseCreator(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"><Plus className="size-3.5"/>Create</button></div>{courses.length?<div className="mt-4 space-y-2">{courses.map((c:any)=><div key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"><BookOpen className="size-4 shrink-0 text-primary"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{c.title}</p><p className="text-[11px] text-muted-foreground">{c.status}</p></div><button onClick={()=>setDeleteTarget(c)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-destructive" aria-label="Delete course"><Trash2 className="size-4"/></button></div>)}</div>:<p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No courses yet. Create your first course to start teaching on X Channel.</p>}</section></div>;
  }

  function PayoutForm(){
    const payout=dashboard?.payout;
    const saved=Boolean(payout?.bankName && payout?.accountName && payout?.accountNumber);
    return <div className="mt-4">
      <section className="rounded-[24px] border border-border bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Payout bank account</p>
            {saved?<><p className="mt-2 text-sm font-semibold">{payout.bankName} <span className="font-medium tracking-[.08em] text-muted-foreground">••••{String(payout.accountNumber).slice(-4)}</span></p><p className="mt-1 text-xs text-muted-foreground">{payout.accountName}</p></>:<p className="mt-2 text-sm text-muted-foreground">No bank account saved. Add your details to receive creator payouts.</p>}
          </div>
          <button type="button" onClick={()=>setBankOpen(true)} className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-border bg-background px-4 text-xs font-semibold text-foreground transition active:scale-[.97]">{saved?"Edit":"Add bank"}</button>
        </div>
      </section>
      <PayoutBankModal open={bankOpen} onClose={()=>setBankOpen(false)} initialValues={{accountName:String(payout?.accountName||""),accountNumber:String(payout?.accountNumber||""),bankName:String(payout?.bankName||"")}} onSave={savePayout}/>
    </div>;
  }

  const isPublicSection=publicTabs.some(([key])=>key===section);
  const activeTabIndex=Math.max(0,publicTabs.findIndex(([key])=>key===section));
  const onEdit=()=>setEditOpen(true);
  const onOpenStudio=()=>setMenuOpen(true);
  
  const editChannel:Channel={id:user.id,displayName,handle:username,bio:publicBio==="Creator on XoraTV"?"":publicBio,avatarUrl:avatar,bannerUrl:coverUrl,followerCount,coursesCount:publishedCourses.length,shortsCount:shorts.length,verified:Boolean(creatorInfo?.verified)};
  const saveChannel=async(update:ChannelUpdate)=>{
    const previous=optimisticChannel;
    const previousBio=creatorInfo?.channelBio||"";
    let customizationSaved=false;
    let bannerSaved=false;
    setOptimisticChannel(update);
    try{
      if(update.bio!==publicBio){
        await commerceFetch("/api/commerce/creator/customization",{method:"POST",body:JSON.stringify({userId:user.id,channelBio:update.bio,featuredTitle,featuredDescription,showCourses,showCommunity})});
        customizationSaved=true;
      }
      if(update.bannerUrl!==coverUrl){
        await commerceFetch("/api/commerce/creator/featured-image",{method:"POST",body:JSON.stringify({userId:user.id,featuredImageUrl:update.bannerUrl})});
        bannerSaved=true;
      }
      const response=await fetch("/api/profile",{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:update.handle,display_name:update.displayName,avatar_url:update.avatarUrl,bio:update.bio})});
      const result=await response.json() as {ok?:boolean;profile?:unknown;error?:string};
      if(!response.ok||!result.ok)throw new Error(result.error||"Could not save your channel profile.");
      setChannelBio(update.bio);
      window.dispatchEvent(new CustomEvent("xora-auth-changed"));
      window.dispatchEvent(new CustomEvent("xora:profile-updated",{detail:result.profile}));
      await refetch();
      setOptimisticChannel(null);
    }catch(error){
      if(bannerSaved)await commerceFetch("/api/commerce/creator/featured-image",{method:"POST",body:JSON.stringify({userId:user.id,featuredImageUrl:coverUrl})}).catch(()=>undefined);
      if(customizationSaved)await commerceFetch("/api/commerce/creator/customization",{method:"POST",body:JSON.stringify({userId:user.id,channelBio:previousBio,featuredTitle,featuredDescription,showCourses,showCommunity})}).catch(()=>undefined);
      setOptimisticChannel(previous);
      throw error;
    }
  };
  const shareChannel=async()=>{
    const url=window.location.origin+"/channel/"+encodeURIComponent(username);
    const payload={title:displayName+" on XoraTV",text:"Discover "+displayName+" on XoraTV.",url};
    if(typeof navigator!=="undefined" && navigator.share){try{await navigator.share(payload);return;}catch(error){if(error instanceof Error && error.name==="AbortError")return;}}
    try{await navigator.clipboard.writeText(url);}catch{window.prompt("Copy your X Channel link",url);}
  };
  const onShare=()=>void shareChannel();
  const handleChannelSwipe=(event:TouchEvent<HTMLDivElement>)=>{
    const start=touchStart.current;touchStart.current=null;
    if(!start||!publicTabs.some(([key])=>key===section))return;
    if(event.target instanceof Element && event.target.closest("button,a,input,textarea,select,video,[contenteditable='true'],[data-no-channel-swipe]"))return;
    const touch=event.changedTouches[0];if(!touch)return;
    const deltaX=touch.clientX-start.x;
    const deltaY=touch.clientY-start.y;
    // Only a deliberate, dominant horizontal gesture changes tabs.
    // Normal vertical and diagonal page scrolling must never switch sections.
    if(Math.abs(deltaX)<60||Math.abs(deltaX)<Math.abs(deltaY)*1.35)return;
    const next=Math.min(publicTabs.length-1,Math.max(0,activeTabIndex+(deltaX<0?1:-1)));
    if(next!==activeTabIndex)setSection(publicTabs[next][0]);
  };

  return <AppShell wide>
    <div className="xora-channel-page min-w-0 max-w-full space-y-5 pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+24px)]">
      <div className="xora-channel-tab-scope">
        <ChannelHeader channel={editChannel} isOwner={isOwner} onEdit={onEdit} onOpenStudio={onOpenStudio} onShare={onShare}/>
        <ChannelTabs tabs={publicTabs} activeTab={publicTabs.some(([id])=>id===section)?section as TabId:"shorts"} onChange={setSection}/>
        <div id="xora-channel-tabpanel" role="tabpanel" aria-labelledby={"xora-channel-tab-"+(publicTabs[activeTabIndex]?.[0]||"shorts")} tabIndex={isPublicSection?0:-1} hidden={!isPublicSection} className="xora-channel-panel" onTouchStart={event=>{const touch=event.touches[0];touchStart.current=event.touches.length===1&&touch?{x:touch.clientX,y:touch.clientY}:null;}} onTouchEnd={handleChannelSwipe} onTouchCancel={()=>{touchStart.current=null;}}>
          {isPublicSection ? PublicContent() : null}
        </div>
      </div>

      {!isPublicSection ? <div className="xora-channel-management-content"><ManageContent/></div> : null}

      <EditChannelSheet key={(editOpen?"open-":"closed-")+username} open={editOpen} channel={editChannel} onOpenChange={setEditOpen} onSave={saveChannel}/>
      <StudioSheet open={menuOpen} tabs={manageTabs} onOpenChange={setMenuOpen} onSelect={(tab)=>{setSection(tab);setMenuOpen(false)}}/>

      {deleteTarget?<div className="fixed inset-0 z-[90] grid place-items-center bg-foreground/30 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl"><div className="flex items-start gap-3"><div className="grid size-9 place-items-center rounded-xl bg-destructive/10 text-destructive"><AlertTriangle className="size-4"/></div><div><h2 className="font-display text-lg font-semibold">Delete “{deleteTarget.title||"Untitled Short"}”?</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{deleteTarget._type==="short"?"This removes the Short from your channel and deletes its stored video.":"This removes the course from your channel catalogue."}</p></div><button onClick={()=>setDeleteTarget(null)} className="ml-auto rounded-lg p-1.5 hover:bg-secondary"><X className="size-4"/></button></div><div className="mt-5 flex justify-end gap-2"><button onClick={()=>setDeleteTarget(null)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">Cancel</button><button onClick={()=>void (deleteTarget._type==="short"?deleteShort():deleteCourse())} disabled={deleteBusy} className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground">{deleteBusy?<Loader2 className="size-3.5 animate-spin"/>:<Trash2 className="size-3.5"/>}Delete</button></div></div></div>:null}
    </div>
  </AppShell>;
}

function PanelTitle({eyebrow,title,text}:{eyebrow:string;title:string;text:string}){return <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">{eyebrow}</p><h2 className="mt-1 font-display text-xl font-semibold tracking-tight">{title}</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{text}</p></div>}
function Metric({label,value}:{label:string;value:any}){return <div className="min-w-0 rounded-xl border border-border bg-surface p-3 shadow-card"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 break-words text-lg font-semibold tabular-nums">{value}</p></div>}
function Stat({label,value}:{label:string;value:string}){return <div className="min-w-0 rounded-xl border border-border bg-background p-3"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-semibold tabular-nums">{value}</p></div>}
function EmptyContent({icon,title,text,action,href}:{icon:any;title:string;text:string;action:string;href:string}){return <section className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center shadow-card"><div className="mx-auto grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</div><h2 className="mt-4 font-display text-xl font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted-foreground">{text}</p><Link to={href as any} className="mt-5 inline-flex rounded-xl border border-border bg-background px-4 py-2 text-xs font-semibold hover:bg-secondary">{action}</Link></section>}
function Action({icon,title,text,href,onClick}:{icon:any;title:string;text:string;href?:string;onClick?:()=>void}){const body=<><div className="text-primary [&>svg]:size-4">{icon}</div><p className="mt-2 text-[13px] font-semibold">{title}</p><p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{text}</p></>;return href?<Link to={href as any} className="min-w-0 rounded-xl border border-border bg-surface p-3 shadow-card transition hover:bg-secondary">{body}</Link>:<button onClick={onClick} className="min-w-0 rounded-xl border border-border bg-surface p-3 text-left shadow-card transition hover:bg-secondary">{body}</button>}
function CourseShelf({courses,isOwner=true}:{courses:any[];isOwner?:boolean}){return courses.length?<div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{courses.map(c=><div key={c.id} className="rounded-xl border border-border bg-surface p-3 shadow-card"><div className="relative aspect-video overflow-hidden rounded-xl bg-secondary text-primary">{c.thumbnailUrl?<img src={c.thumbnailUrl} alt={"Thumbnail for "+c.title} loading="lazy" className="size-full object-cover"/>:<div className="grid size-full place-items-center"><BookOpen className="size-6"/></div>}</div><p className="mt-3 truncate text-sm font-semibold">{c.title}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{Number(c.unlockPoints||Math.ceil(Number(c.price||0)/0.1)).toLocaleString()} XP · Unlock through CPA-earned Xora Points.</p></div>)}</div>:<section className="xora-channel-empty"><div className="xora-channel-empty-icon"><BookOpen className="size-6"/></div><h2>No courses yet</h2><p>{isOwner?"Create a course and share what you know with your audience.":"Check back soon."}</p>{isOwner?<a href="/creator-studio?createCourse=1" className="xora-channel-empty-action"><BookOpen className="size-4"/>Create course</a>:null}</section>}
