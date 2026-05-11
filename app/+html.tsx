import { ScrollViewStyleReset } from "expo-router/html";

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        {/* PWA manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Theme */}
        <meta name="theme-color" content="#6366f1" />
        <meta name="background-color" content="#0f172a" />

        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" sizes="32x32" />

        {/* iOS PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SideQuests" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* Prevent font scaling */}
        <ScrollViewStyleReset />
      </head>
      <body style={{ backgroundColor: "#0f172a", margin: 0 }}>{children}</body>
    </html>
  );
}
