import Link from "next/link";
import { GusekWorkbench } from "../../../components/gusek-workbench";

/** Independent Tredven pilot page. No patch to upstream Home or chat. */
export default function GusekPage() {
  return <><nav className="mx-auto max-w-[1520px] px-4 pt-4 text-sm">
    <Link className="underline" href="/pilot/gusek/szakmai">További operációkutatási feladatok: hozzárendelés és termeléstervezés</Link>
  </nav><GusekWorkbench /></>;
}
