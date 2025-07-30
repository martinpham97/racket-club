"use client";

import { Card, CardBody, CardHeader } from "@heroui/card";
import { Divider } from "@heroui/divider";

export interface CenterCardProps {
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}

export default function CenterCard({ title, description, children }: CenterCardProps) {
  return (
    <Card shadow="md" className="items-center p-2">
      {(title || description) && (
        <>
          <CardHeader className="flex flex-col">
            {title && <p className="text-md">{title}</p>}
            {description && <p className="text-small text-default-500">{description}</p>}
          </CardHeader>
          <Divider className="my-2" />
        </>
      )}
      <CardBody>{children}</CardBody>
    </Card>
  );
}
