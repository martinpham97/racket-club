import { Id, TableNames } from "@/convex/_generated/dataModel";
import { SystemTableNames } from "convex/server";

let idCounter = 0;
export const genId = <T extends TableNames | SystemTableNames>(prefix: string): Id<T> => {
  return `${prefix}_${++idCounter}` as Id<T>;
};
