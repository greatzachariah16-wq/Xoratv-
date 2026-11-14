import { UserAvatar } from "@/components/xora/UserAvatar";
import type { Channel } from "@/components/xora/EditChannelSheet";

export function CompactBar({ channel, visible, onEdit }: { channel: Channel; visible: boolean; onEdit(): void }) {
  return (
    <div className="xora-channel-compact" data-visible={visible} aria-hidden={!visible} inert={!visible}>
      <UserAvatar path={channel.avatarUrl} name={channel.displayName} size={34} className="!rounded-full"/>
      <span className="xora-channel-compact-name">{channel.displayName}</span>
      <button type="button" tabIndex={visible ? 0 : -1} onClick={onEdit}>Edit channel</button>
    </div>
  );
}
