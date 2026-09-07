import Workspace from "@/components/workspace";
import { getDashboardData } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default function Home() {
  return <Workspace initialData={getDashboardData()} />;
}
