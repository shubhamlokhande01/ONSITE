import { createFileRoute, Link } from "@tanstack/react-router";
import { Briefcase, MapPin, Camera, ClipboardCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FieldOps — Employee Field Management" },
      {
        name: "description",
        content:
          "Manage employees, attendance, tasks, locations and field photos from one dashboard.",
      },
      { property: "og:title", content: "FieldOps — Employee Field Management" },
      {
        property: "og:description",
        content:
          "Manage employees, attendance, tasks, locations and field photos from one dashboard.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            <span className="font-semibold">FieldOps</span>
          </div>
          <Link
            to="/auth"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign in
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Field operations,{" "}
          <span className="text-primary">all in one place.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Track attendance with GPS, assign tasks, monitor locations, and
          collect field photos from your distributed team.
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <Link
            to="/auth"
            className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Get started
          </Link>
          <Link
            to="/dashboard"
            className="rounded-md border border-input bg-background px-6 py-3 text-sm font-medium hover:bg-accent"
          >
            Open dashboard
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 pb-20 md:grid-cols-3">
        {[
          {
            icon: ClipboardCheck,
            title: "Tasks & Attendance",
            desc: "Assign work, mark check-ins, and track progress in real time.",
          },
          {
            icon: MapPin,
            title: "Live Locations",
            desc: "Capture GPS coordinates with every check-in and update.",
          },
          {
            icon: Camera,
            title: "Field Photos",
            desc: "Upload proof-of-work photos linked to tasks and employees.",
          },
        ].map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="rounded-lg border border-border bg-card p-6"
          >
            <Icon className="h-6 w-6 text-primary" />
            <h3 className="mt-4 font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
