// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FixtureBanner } from "@/components/shell/FixtureBanner";

describe("FixtureBanner", () => {
  it("is visible for fixture data", () => {
    render(<FixtureBanner source="fixture" />);
    expect(screen.getByRole("status")).toHaveTextContent(/FIXTURE DATA/);
  });

  it("is absent for live data", () => {
    const { container } = render(<FixtureBanner source="live" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is absent while nothing has loaded", () => {
    const { container } = render(<FixtureBanner source={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
