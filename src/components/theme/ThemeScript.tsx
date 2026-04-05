import Script from "next/script";

/** Runs before interactive to avoid light flash when stored theme is dark */
export function ThemeScript() {
  const code = `(function(){try{var k="chronos-theme",s=localStorage.getItem(k),r=document.documentElement;if(s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches)){r.classList.add("dark")}else{r.classList.remove("dark")}}catch(e){}})();`;
  return <Script id="chronos-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: code }} />;
}
