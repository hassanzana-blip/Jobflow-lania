import { MobileWorkspace } from "./mobile-workspace";
import { demoWorkspace } from "@/core/demo-workspace";
export function ProductPreview() {
  return <MobileWorkspace mode="demo" initial={demoWorkspace()} />;
}
