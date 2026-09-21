import { demoEvents } from "@ticket-hub/contracts/demo";
import { HomeExplorer } from "@/components/HomeExplorer";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <HomeExplorer events={demoEvents} />
      <SiteFooter />
    </>
  );
}
