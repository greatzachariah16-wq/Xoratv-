import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AdminProtectedLayout } from "@/components/admin/AdminProtectedLayout";
import { XserisController } from "@/components/xora/XserisController";

export const Route = createFileRoute("/admin/xseris")({
  head: () => ({
    meta: [
      { title: "Xseris Controller — Admin — Xora" },
      {
        name: "description",
        content: "Manage Xseris source imports and review the catalog queue.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: XserisAdminPage,
});

function XserisAdminPage() {
  return (
    <AdminProtectedLayout title="Xseris Controller" currentSectionId="xseris">
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-ink px-5 py-8 text-primary-foreground shadow-lift sm:px-10 sm:py-10 lg:px-12 lg:py-12">
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-sage">
            <ShieldCheck className="size-3.5" /> Secure catalog operations
          </div>
          <h1 className="mt-4 bg-gradient-to-r from-primary via-primary to-sage bg-clip-text font-display text-4xl font-bold leading-[0.95] text-transparent sm:text-5xl lg:text-6xl">
            Xseris Controller
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-primary-foreground/60 sm:text-[15px]">
            Import permitted source links, review extracted metadata, assign categories, and
            publish approved titles into the XoraTV catalog.
          </p>
          <Link
            to="/admin"
            className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-sage transition-opacity hover:opacity-80"
          >
            <ArrowLeft className="size-4" /> Back to dashboard
          </Link>
        </div>
      </section>

      <XserisController />
    </AdminProtectedLayout>
  );
}
