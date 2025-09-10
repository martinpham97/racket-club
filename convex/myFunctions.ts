import { getAuthUserId } from "@convex-dev/auth/server";
import z from "zod";
import { authenticatedMutation, publicQuery } from "./functions";

// Write your Convex functions in any file inside this directory (`convex`).
// See https://docs.convex.dev/functions for more.

// You can read data from the database via a query:
export const listNumbers = publicQuery()({
  // Validators for arguments.
  args: {
    count: z.number().nonnegative(),
  },

  // Query implementation.
  handler: async (ctx, args) => {
    //// Read the database as many times as you need here.
    //// See https://docs.convex.dev/database/reading-data.
    const numbers = await ctx
      .table("numbers")
      // Ordered by _creationTime, return most recent
      .order("desc")
      .take(args.count);
    const userId = await getAuthUserId(ctx);
    const user = userId === null ? null : await ctx.table("users").get(userId);
    return {
      viewer: user?.email ?? null,
      numbers: numbers.reverse().map((number) => number.value),
    };
  },
});

// You can write data to the database via a mutation:
export const addNumber = authenticatedMutation()({
  // Validators for arguments.
  args: {
    value: z.number(),
  },

  // Mutation implementation.
  handler: async (ctx, args) => {
    //// Insert or modify documents in the database here.
    //// Mutations can also read from the database like queries.
    //// See https://docs.convex.dev/database/writing-data.

    const id = await ctx.table("numbers").insert({ value: args.value });

    console.log("Added new document with id:", id);
    // Optionally, return a value from your mutation.
    // return id;
  },
});
