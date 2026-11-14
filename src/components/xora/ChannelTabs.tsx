import type { CSSProperties, KeyboardEvent } from "react";

export type TabId = "shorts" | "courses" | "posts" | "about";

type ChannelTabsProps = {
  tabs: Array<[TabId, string]>;
  activeTab: TabId;
  onChange(tab: TabId): void;
};

export function ChannelTabs({ tabs, activeTab, onChange }: ChannelTabsProps) {
  const activeIndex = Math.max(0, tabs.findIndex(([id]) => id === activeTab));
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next][0]);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <nav className="xora-channel-tabs" role="tablist" aria-label="Channel sections">
      {tabs.map(([id, label], index) => (
        <button type="button" key={id} id={"xora-channel-tab-" + id} role="tab" aria-selected={activeTab === id} aria-controls="xora-channel-tabpanel" onClick={() => onChange(id)} onKeyDown={(event) => handleKeyDown(event, index)} className="xora-channel-tab">{label}</button>
      ))}
      <span className="xora-channel-tab-indicator" aria-hidden="true" style={{ "--tab-index": activeIndex, "--tab-count": tabs.length } as CSSProperties}/>
    </nav>
  );
}
