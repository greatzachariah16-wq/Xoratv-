import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { LargeBannerPopupAd } from "@/components/ads/LargeBannerPopupAd";
import { HilltopInPagePushAd } from "@/components/ads/HilltopInPagePushAd";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    if (error?.message === "Script error." || error?.message?.includes("Script error")) {
      router.invalidate();
      reset();
    }
  }, [error, reset, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Xora" },
      {
        name: "description",
        content:
          "Xseris streaming network and custom logo-free video streaming web platform with admin controller and media catalog",
      },
      { property: "og:title", content: "Xora" },
      {
        property: "og:description",
        content:
          "Xseris streaming network and custom logo-free video streaming web platform with admin controller and media catalog",
      },
      { name: "theme-color", content: "#faf6ef" },
      { name: "author", content: "Xora" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Xora" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "4b48232c4ffdb43fa729a37bf8008b73b97009f5", content: "4b48232c4ffdb43fa729a37bf8008b73b97009f5" },
      { name: "hilltopads-site-verification", content: "4b48232c4ffdb43fa729a37bf8008b73b97009f5" },
      { name: "exoclick-site-verification", content: "89cfa11e5cd3529d8d2fee19321fc484" },
      { name: "89cfa11e5cd3529d8d2fee19321fc484", content: "89cfa11e5cd3529d8d2fee19321fc484" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap",
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/icon-192.png" },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
    ],
    scripts: [
      {
        id: "hilltop-inpage-push-script",
        src: "//untimely-hello.com/bIXqV.std/G/lf0qYuWKcK/-exmD9lupZ/UolXkrPmTzcv0/NQTHQ/0VMyTYMGtUN/z/Qy1uNaDCQ_xMNawR",
        async: true,
        referrerPolicy: "no-referrer-when-downgrade",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      if (
        event.message === "Script error." ||
        event.message?.includes("Script error") ||
        event.filename?.includes("highrevenueformat") ||
        event.filename?.includes("monetag")
      ) {
        event.preventDefault();
        return true;
      }
    };

    window.addEventListener("error", handleGlobalError);
    return () => {
      window.removeEventListener("error", handleGlobalError);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster position="top-center" />
        <LargeBannerPopupAd />
        <HilltopInPagePushAd />
      </AuthProvider>
    </QueryClientProvider>
  );
}
