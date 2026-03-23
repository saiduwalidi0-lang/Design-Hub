import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { within } from "@testing-library/react";
import { renderWithRouter } from "@/test/render";
import Home from "@/pages/Home";

describe("Home", () => {
  it("shows multi-size options", () => {
    renderWithRouter(<Home />);
    expect(screen.getByText("输出尺寸（可多选）")).toBeInTheDocument();
    expect(screen.getByText("3712x1000")).toBeInTheDocument();
  });

  it("can toggle avatar-frame panel", () => {
    renderWithRouter(<Home />);
    expect(screen.getAllByText("输出类型").length).toBeGreaterThan(0);
    expect(screen.queryByText("头像框工作流")).not.toBeInTheDocument();
    const label = screen.getAllByText("生成头像框")[0].closest("label");
    expect(label).not.toBeNull();
    const cb = within(label as HTMLElement).getByRole("checkbox");
    fireEvent.click(cb);
    expect(screen.getByText("头像框工作流")).toBeInTheDocument();
  });
});
