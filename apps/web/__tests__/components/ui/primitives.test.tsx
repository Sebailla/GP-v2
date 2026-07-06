import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "node:test";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form } from "@/components/ui/form";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

/**
 * TDD contract for the four foundational shadcn-style primitives in
 * `apps/web/components/ui/` — slice 4 batch 4b (T4.4).
 *
 * Per design §6.5: each primitive is a thin wrapper over `@radix-ui/
 * react-*` (Slot, Label) with `class-variance-authority` for the
 * variant matrix and `tailwind-merge` (via the `cn` helper shipped in
 * batch 4a) for the merge step. **NO `shadcn-ui` CLI** — files are
 * committed and editable.
 *
 * The contract pinned by these tests is the PUBLIC seam that the
 * downstream forms (T4.8–T4.12 in slice 4 batches 4c–4d) will
 * consume:
 *
 *  1. Button — variants (default / destructive / outline / secondary /
 *     ghost / link) + sizes (default / sm / lg / icon), `asChild`
 *     composes with the child element via Radix `Slot`, default
 *     variant renders `bg-ui-accent text-ui-accent-fg`, `data-slot`
 *     marker is present for future tooling, className override via
 *     `tailwind-merge` wins over the default variant class.
 *  2. Input — renders an `<input type="text">` by default, forwards
 *     all native props (type, value, onChange, placeholder, etc.),
 *     accepts a className override that wins over the default
 *     classes via `cn`, `data-slot="input"` marker is present.
 *  3. Form — minimal `<FormProvider>` wrapper so the slice 4c
 *     pages can compose `useForm()` with `<Form>` without bringing
 *     the full `<Form><FormField>...` shadcn scaffold (those land
 *     with the actual login page in batch 4c). Renders its children
 *     inside a `<form>` element so `onSubmit` fires normally.
 *  4. Card — compound primitive: `Card` + `CardHeader` +
 *     `CardTitle` + `CardDescription` + `CardContent` +
 *     `CardFooter`. Each sub-component renders the semantic element
 *     (Card → <div role="region">, CardHeader → <div>, CardTitle →
 *     <h3>, CardDescription → <p>, CardContent → <div>, CardFooter
 *     → <div>) and forwards refs.
 *
 * Strict TDD sequence: this file is the RED. The four primitive
 * modules don't exist yet (`button.tsx`, `input.tsx`, `form.tsx`,
 * `card.tsx`), so the import statements fail with TS2307 / Cannot
 * find module. The GREEN commit ships the four modules and the
 * 30 assertions below all pass.
 */

// happy-dom leaks DOM nodes between tests; clean up explicitly so
// render() calls don't pollute sibling test files.
afterEach(() => {
  cleanup();
});

describe("Button — shadcn-style primitive (T4.4)", () => {
  it("renders a native <button> with the default variant classes", () => {
    render(<Button>Sign in</Button>);
    const btn = screen.getByRole("button", { name: /sign in/i });
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe("BUTTON");
    // Default variant = primary (accent bg + accent-fg text).
    expect(btn).toHaveClass("bg-ui-accent");
    expect(btn).toHaveClass("text-ui-accent-fg");
    // `data-slot` marker for tooling (shadcn convention).
    expect(btn).toHaveAttribute("data-slot", "button");
  });

  it("applies the destructive variant (bg-ui-danger + text-ui-danger-fg)", () => {
    render(<Button variant="destructive">Delete account</Button>);
    const btn = screen.getByRole("button", { name: /delete account/i });
    expect(btn).toHaveClass("bg-ui-danger");
    expect(btn).toHaveClass("text-ui-danger-fg");
  });

  it("applies the outline variant (bg-transparent + border-ui-border)", () => {
    render(<Button variant="outline">Cancel</Button>);
    const btn = screen.getByRole("button", { name: /cancel/i });
    expect(btn).toHaveClass("bg-transparent");
    expect(btn).toHaveClass("border-ui-border");
  });

  it("applies the secondary variant (bg-ui-bg-muted + text-ui-fg)", () => {
    render(<Button variant="secondary">Back</Button>);
    const btn = screen.getByRole("button", { name: /back/i });
    expect(btn).toHaveClass("bg-ui-bg-muted");
    expect(btn).toHaveClass("text-ui-fg");
  });

  it("applies the ghost variant (bg-transparent + text-ui-fg)", () => {
    render(<Button variant="ghost">Skip</Button>);
    const btn = screen.getByRole("button", { name: /skip/i });
    expect(btn).toHaveClass("bg-transparent");
    expect(btn).toHaveClass("text-ui-fg");
  });

  it("applies the link variant (text-ui-accent + underline)", () => {
    render(<Button variant="link">Learn more</Button>);
    const btn = screen.getByRole("button", { name: /learn more/i });
    expect(btn).toHaveClass("text-ui-accent");
    expect(btn).toHaveClass("underline");
  });

  it("applies the sm size (smaller padding + text-ui-text-sm)", () => {
    render(<Button size="sm">Small</Button>);
    const btn = screen.getByRole("button", { name: /small/i });
    expect(btn).toHaveClass("text-ui-text-sm");
  });

  it("applies the lg size (larger padding + text-ui-text-lg)", () => {
    render(<Button size="lg">Large</Button>);
    const btn = screen.getByRole("button", { name: /large/i });
    expect(btn).toHaveClass("text-ui-text-lg");
  });

  it("applies the icon size (square 10x10, p-0)", () => {
    render(
      <Button size="icon" aria-label="Close">
        ×
      </Button>,
    );
    const btn = screen.getByRole("button", { name: /close/i });
    expect(btn).toHaveClass("size-10");
  });

  it("className override wins over the default variant class via tailwind-merge", () => {
    // The default variant adds bg-ui-accent; the override `bg-red-500`
    // should win (the merger treats bg-* as a single conflict group).
    render(<Button className="bg-red-500">Override</Button>);
    const btn = screen.getByRole("button", { name: /override/i });
    expect(btn).toHaveClass("bg-red-500");
    expect(btn).not.toHaveClass("bg-ui-accent");
  });

  it("asChild composes the child via Radix Slot (no wrapping <button>)", () => {
    // When `asChild` is true, Radix Slot MERGES the button's props
    // onto the child element. The rendered DOM MUST be the child
    // (<a>), NOT a wrapping <button><a></a></button>.
    render(
      <Button asChild>
        <a href="/sign-in">Continue with link</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: /continue with link/i });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/sign-in");
    // The Slot merge means the anchor inherits the button's classes.
    expect(link).toHaveClass("bg-ui-accent");
    expect(link).toHaveAttribute("data-slot", "button");
    // No wrapping <button> should be present in the rendered tree.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("forwards native button props (disabled, type, onClick)", () => {
    const onClick = vi.fn();
    render(
      <Button type="submit" disabled onClick={onClick}>
        Submit
      </Button>,
    );
    const btn = screen.getByRole("button", { name: /submit/i });
    expect(btn).toHaveAttribute("type", "submit");
    expect(btn).toBeDisabled();
    btn.click();
    expect(onClick).not.toHaveBeenCalled(); // disabled blocks click
  });
});

describe("Input — shadcn-style primitive (T4.4)", () => {
  it("renders a native <input type='text'> with default classes", () => {
    render(<Input aria-label="Email" placeholder="you@example.com" />);
    const input = screen.getByLabelText(/email/i);
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveClass("border-ui-border");
    expect(input).toHaveClass("bg-ui-bg");
    expect(input).toHaveAttribute("data-slot", "input");
  });

  it("honors the type prop (email / password)", () => {
    render(
      <>
        <Input type="email" aria-label="Email" />
        <Input type="password" aria-label="Password" />
      </>,
    );
    expect(screen.getByLabelText(/email/i)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(/password/i)).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("className override wins over the default border class via cn", () => {
    render(
      <Input aria-label="Custom" className="border-red-500" />,
    );
    const input = screen.getByLabelText(/custom/i);
    // Default border class is `border-ui-border`; the override
    // `border-red-500` wins via tailwind-merge's last-write semantics.
    expect(input).toHaveClass("border-red-500");
    expect(input).not.toHaveClass("border-ui-border");
  });

  it("forwards native input props (value, onChange, placeholder)", () => {
    const onChange = vi.fn();
    render(
      <Input
        aria-label="Name"
        value="sebastian"
        onChange={onChange}
        placeholder="Type your name"
      />,
    );
    const input = screen.getByLabelText(/name/i);
    expect(input).toHaveValue("sebastian");
    expect(input).toHaveAttribute("placeholder", "type your name");
  });
});

describe("Form — minimal FormProvider wrapper (T4.4)", () => {
  it("renders a native <form> with the data-slot marker", () => {
    const { container } = render(
      <Form aria-label="Sign in form">
        <input type="email" aria-label="Email" />
        <button type="submit">Submit</button>
      </Form>,
    );
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute("data-slot", "form");
    expect(form).toHaveAttribute("aria-label", "Sign in form");
  });

  it("forwards onSubmit to the native form element", () => {
    const onSubmit = vi.fn((e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
    });
    render(
      <Form onSubmit={onSubmit}>
        <input type="email" aria-label="Email" />
        <button type="submit">Submit</button>
      </Form>,
    );
    const form = document.querySelector("form")!;
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("renders its children inside the form element", () => {
    render(
      <Form>
        <label htmlFor="name">Name</label>
        <input id="name" type="text" />
      </Form>,
    );
    const form = document.querySelector("form")!;
    expect(form.contains(screen.getByLabelText(/name/i))).toBe(true);
  });
});

describe("Card — compound primitive (T4.4)", () => {
  it("Card renders a region with bg-ui-bg + border-ui-border + data-slot='card'", () => {
    const { container } = render(
      <Card aria-label="Profile summary">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account at a glance</CardDescription>
        </CardHeader>
        <CardContent>Body content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );
    const card = container.querySelector('[data-slot="card"]');
    expect(card).not.toBeNull();
    expect(card).toHaveClass("bg-ui-bg");
    expect(card).toHaveClass("border-ui-border");
    expect(card).toHaveClass("rounded-ui-lg");
    // The aria-label makes the region accessible to screen readers.
    expect(card).toHaveAttribute("aria-label", "Profile summary");
  });

  it("CardHeader / CardTitle / CardDescription render with semantic markup + data-slot", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>My title</CardTitle>
          <CardDescription>My description</CardDescription>
        </CardHeader>
      </Card>,
    );
    const header = document.querySelector('[data-slot="card-header"]');
    const title = document.querySelector('[data-slot="card-title"]');
    const desc = document.querySelector('[data-slot="card-description"]');
    expect(header).not.toBeNull();
    expect(title).not.toBeNull();
    expect(desc).not.toBeNull();
    expect(title!.tagName).toBe("H3");
    expect(desc!.tagName).toBe("P");
    expect(title).toHaveTextContent("My title");
    expect(desc).toHaveTextContent("My description");
  });

  it("CardContent / CardFooter render with data-slot markers", () => {
    render(
      <Card>
        <CardContent>Body</CardContent>
        <CardFooter>Foot</CardFooter>
      </Card>,
    );
    expect(document.querySelector('[data-slot="card-content"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="card-footer"]')).not.toBeNull();
  });

  it("forwards refs to the underlying DOM element", () => {
    const cardRef = React.createRef<HTMLDivElement>();
    const titleRef = React.createRef<HTMLHeadingElement>();
    render(
      <Card ref={cardRef}>
        <CardHeader>
          <CardTitle ref={titleRef}>Ref title</CardTitle>
        </CardHeader>
      </Card>,
    );
    expect(cardRef.current).not.toBeNull();
    expect(cardRef.current!.tagName).toBe("DIV");
    expect(titleRef.current).not.toBeNull();
    expect(titleRef.current!.tagName).toBe("H3");
  });
});