"use client";

import { UserProfileInput, userProfileInputSchema } from "@/convex/service/users/schemas";
import { Button } from "@heroui/button";
import { DatePicker } from "@heroui/date-picker";
import { Form } from "@heroui/form";
import { Input, Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDate } from "@internationalized/date";
import { Controller, FieldErrors, useForm } from "react-hook-form";

export interface ProfileFormProps {
  formId: string;
  defaultValues?: Partial<UserProfileInput> | null;
  onSubmit: (values: UserProfileInput) => Promise<void>;
}

export function ProfileForm({ formId, defaultValues, onSubmit }: ProfileFormProps) {
  function parseTimestampDate(timestamp?: number): CalendarDate | null {
    if (!timestamp) {
      return null;
    }
    const date = new Date(timestamp);
    return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  function mapErrors(errors: FieldErrors): Record<string, string> {
    return Object.fromEntries(
      Object.entries(errors)
        .filter(([, err]) => err?.message)
        .map(([field, err]) => [field, err!.message as string]),
    );
  }

  const form = useForm<UserProfileInput>({
    resolver: zodResolver(userProfileInputSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      gender: undefined,
      dob: undefined,
      skillLevel: undefined,
      preferredPlayStyle: undefined,
      bio: "",
      ...defaultValues,
    },
  });

  return (
    <Form
      id={formId}
      onSubmit={form.handleSubmit(onSubmit)}
      validationBehavior="aria"
      validationErrors={mapErrors(form.formState.errors)}
    >
      <div className="space-y-4 sm:min-w-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <Controller
            control={form.control}
            name="firstName"
            render={({ field }) => <Input {...field} label="First Name" />}
          />
          <Controller
            control={form.control}
            name="lastName"
            render={({ field }) => <Input {...field} label="Last Name" />}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <Controller
            control={form.control}
            name="gender"
            render={({ field }) => (
              <Select
                {...field}
                className="w-full"
                label="Gender"
                onChange={() => field.onChange(field.value || undefined)}
                selectedKeys={field.value ? [field.value] : []}
              >
                {[
                  { key: "Male", value: "M" },
                  { key: "Female", value: "F" },
                ].map((gender) => (
                  <SelectItem key={gender.value}>{gender.key}</SelectItem>
                ))}
              </Select>
            )}
          />

          <Controller
            control={form.control}
            name="dob"
            render={({ field }) => (
              <DatePicker
                {...field}
                value={parseTimestampDate(field.value)}
                onChange={(value) => field.onChange(value?.toDate("UTC").getTime())}
                showMonthAndYearPickers
                label="Date of Birth"
                CalendarBottomContent={
                  <Button
                    className="w-full"
                    variant="light"
                    onPress={() => field.onChange(undefined)}
                  >
                    Clear
                  </Button>
                }
              />
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <Controller
            control={form.control}
            name="skillLevel"
            render={({ field }) => (
              <Select
                {...field}
                className="w-full"
                label="Skill Level"
                onChange={() => field.onChange(field.value || undefined)}
                selectedKeys={field.value ? [field.value] : []}
              >
                {["A", "B", "C", "D", "E", "OPEN"].map((level) => (
                  <SelectItem key={level}>{level}</SelectItem>
                ))}
              </Select>
            )}
          />

          <Controller
            control={form.control}
            name="preferredPlayStyle"
            render={({ field }) => (
              <Select
                {...field}
                className="w-full"
                label="Preferred Play Style"
                onChange={() => field.onChange(field.value || undefined)}
                selectedKeys={field.value ? [field.value] : []}
              >
                {["MS", "MD", "WS", "WD", "XD"].map((style) => (
                  <SelectItem key={style}>{style}</SelectItem>
                ))}
              </Select>
            )}
          />
        </div>

        <Controller
          control={form.control}
          name="bio"
          render={({ field }) => (
            <Textarea
              {...field}
              label="Bio"
              placeholder="Tell us a bit about yourself..."
              {...field}
            />
          )}
        />
      </div>
    </Form>
  );
}
