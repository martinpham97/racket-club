import { Id, TableNames } from "@/convex/_generated/dataModel";

let idCounter = 0;
export const genId = <T extends TableNames>(prefix: string): Id<T> => {
  return `${prefix}_${++idCounter}` as Id<T>;
};
