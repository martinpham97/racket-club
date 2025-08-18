import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api.js";
import { DataModel } from "./_generated/dataModel.js";

export const migrations = new Migrations<DataModel>(components.migrations);

export const setDefaultTzValue = migrations.define({
  table: "sessionTemplates",
  migrateOne: async (ctx, doc) => {
    await ctx.db.patch(doc._id, {
      location: {
        ...doc.location,
        timezone: "Australia/Sydney",
      },
    });
  },
});

export const runTzMigration = migrations.runner(internal.migrations.setDefaultTzValue);
