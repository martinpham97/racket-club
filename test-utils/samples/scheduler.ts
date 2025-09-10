import { Id } from "@/convex/_generated/dataModel";
import { convexTest } from "@/convex/setup.testing";

export class SchedulerTestHelpers {
  constructor(private t: ReturnType<typeof convexTest>) {}

  async getScheduledFunction(functionId: Id<"_scheduled_functions">) {
    return await this.t.runWithCtx((ctx) =>
      ctx.table.system("_scheduled_functions").get(functionId),
    );
  }

  async getAllScheduledFunctions() {
    return await this.t.runWithCtx((ctx) => ctx.table.system("_scheduled_functions"));
  }

  async getScheduledFunctionsByName(name: string) {
    return await this.t.runWithCtx((ctx) =>
      ctx.table.system("_scheduled_functions").filter((q) => q.eq(q.field("name"), name)),
    );
  }
}
