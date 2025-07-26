"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface CenterCardProps {
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}

export default function CenterCard({ title, description, children }: CenterCardProps) {
  return (
    <div className="flex flex-col gap-8 items-center">
      <Card className="w-full max-h-full">
        {(title || description) && (
          <CardHeader className="text-center">
            {title && <CardTitle>{title}</CardTitle>}
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
        )}
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
