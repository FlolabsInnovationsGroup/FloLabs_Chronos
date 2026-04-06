import Script from "next/script";

/**
 * Runs before interactive to avoid flash. Supports `light`, `dark`, and `system` (or missing/legacy → OS preference).
 */
export function ThemeScript() {
  const code = `(function(){try{var k="chronos-theme",s=localStorage.getItem(k),r=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)").matches,d=s==="dark"?!0:s==="light"?!1:m;if(d)r.classList.add("dark");else r.classList.remove("dark")}catch(e){}})();`;
  return <Script id="chronos-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: code }} />;
}
