import { HomeExplorer } from "@/components/HomeExplorer";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <HomeExplorer />
      <SiteFooter />
    </>
  );
}
