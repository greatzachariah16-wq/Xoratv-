import { createFileRoute } from "@tanstack/react-router";
import { ChatIndexPage } from "./chat";

export const Route = createFileRoute("/chat/$roomId")({
  head: () => ({
    meta: [
      { title: "Conversation — Xora Live Chat" },
      {
        name: "description",
        content: "Live messaging on Xora. Messages automatically expire and delete after 7 days.",
      },
      { property: "og:title", content: "Conversation — Xora Live Chat" },
      { property: "og:description", content: "Chat in real-time with cinephiles on Xora." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChatRoomRoutePage,
});

function ChatRoomRoutePage() {
  const { roomId } = Route.useParams();
  return <ChatIndexPage initialRoomId={roomId} />;
}
