import { BadgeCheck, Bell, PenLine, Radio, Settings2, Share2, Users } from "lucide-react";
import { UserAvatar } from "@/components/xora/UserAvatar";
import type { Channel } from "@/components/xora/EditChannelSheet";

export type ChannelHeaderProps = {
  channel: Channel;
  isOwner: boolean;
  onEdit(): void;
  onOpenStudio(): void;
  onShare(): void;
};

export function ChannelHeader({ channel, isOwner, onEdit, onOpenStudio, onShare }: ChannelHeaderProps) {
  const followers = Number(channel.followerCount || 0);
  const followerLabel = followers === 0 ? "New channel" : new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(followers) + " followers";

  return (
    <header className="xora-channel-hero">
      <div className="xora-channel-cover" style={channel.bannerUrl ? { backgroundImage: 'linear-gradient(180deg,rgba(38,23,17,.05),rgba(38,23,17,.4)),url("' + channel.bannerUrl + '")' } : undefined}>
        <span className="xora-channel-pill"><Radio className="size-3"/>X CHANNEL</span>
      </div>
      <div className="xora-channel-card">
        <div className="xora-channel-identity">
          <div className="xora-channel-avatar-wrap">
            <UserAvatar path={channel.avatarUrl} name={channel.displayName} size={88} className="!rounded-full"/>
            {channel.verified ? <span className="xora-channel-verified" aria-label="Verified channel"><BadgeCheck className="size-4"/></span> : null}
          </div>
          <div className="xora-channel-copy">
            <div className="xora-channel-name-row"><h1 className="xora-channel-name">{channel.displayName}</h1></div>
            <p className="xora-channel-handle">@{channel.handle}</p>
            <p className="xora-channel-followers">{followerLabel}</p>
          </div>
        </div>
        <div className="xora-channel-actions">
          {isOwner ? (
            <>
              <button type="button" onClick={onEdit} className="xora-channel-primary"><PenLine className="size-4"/>Edit channel</button>
              <button type="button" onClick={onShare} className="xora-channel-icon-button" aria-label="Share channel" title="Share channel"><Share2 className="size-4"/></button>
              <button type="button" onClick={onOpenStudio} className="xora-channel-icon-button" aria-label="Open creator studio" title="Creator studio"><Settings2 className="size-4"/></button>
            </>
          ) : (
            <>
              <button type="button" className="xora-channel-primary"><Users className="size-4"/>Subscribe</button>
              <button type="button" onClick={onShare} className="xora-channel-icon-button" aria-label="Share channel"><Share2 className="size-4"/></button>
              <button type="button" className="xora-channel-icon-button" aria-label="Channel notifications"><Bell className="size-4"/></button>
            </>
          )}
        </div>
        <p className="xora-channel-bio">{channel.bio || "Stories, ideas and original videos from XoraTV."}</p>
        <div className="xora-channel-stats">
          <span><strong>{followers === 0 ? "—" : new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(followers)}</strong><small>{followers === 0 ? "New channel" : "Followers"}</small></span>
          <span><strong>{channel.coursesCount || 0}</strong><small>Courses</small></span>
          <span><strong>{channel.shortsCount || 0}</strong><small>Shorts</small></span>
        </div>
      </div>
    </header>
  );
}
