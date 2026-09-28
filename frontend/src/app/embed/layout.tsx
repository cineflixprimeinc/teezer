/* Embed layout - intentionally minimal: no auth providers, no sidebars,
   no Toaster, no AuthModal. Embed pages must work without any session. */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-black">
      {children}
    </div>
  );
}
