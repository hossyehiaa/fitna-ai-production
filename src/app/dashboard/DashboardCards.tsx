import { CheckCircle2, Award, BarChart3, BookOpenText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function DashboardCards({
  completedCount,
  avgScore,
  badgeCount,
  topicCount,
}: {
  completedCount: number;
  avgScore: number;
  badgeCount: number;
  topicCount: number;
}) {
  const items = [
    {
      icon: CheckCircle2,
      label: "جلسات مكتملة",
      value: completedCount,
      hint: "منذ انضمامك للمنصة",
    },
    {
      icon: BarChart3,
      label: "متوسط الأداء",
      value: `${avgScore}`,
      unit: "/100",
      hint: "متوسط درجات جلساتك",
    },
    {
      icon: Award,
      label: "شارات مُكتسبة",
      value: badgeCount,
      hint: "من أصل 6 شارات تربوية",
    },
    {
      icon: BookOpenText,
      label: "موضوعات متاحة",
      value: topicCount,
      hint: "موضوعات تدريب جاهزة",
    },
  ];

  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="إحصاءات الأداء">
      {items.map((item) => (
        <Card key={item.label} className="border-border/70">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs sm:text-sm text-muted-foreground font-medium">{item.label}</span>
              <item.icon className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <p className="font-heading text-2xl sm:text-3xl font-extrabold tabular-nums">
              {item.value}
              {item.unit && <span className="text-sm text-muted-foreground font-bold"> {item.unit}</span>}
            </p>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">{item.hint}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
