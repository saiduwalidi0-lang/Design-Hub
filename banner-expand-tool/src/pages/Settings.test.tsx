import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/render";
import Settings from "@/pages/Settings";

describe("Settings", () => {
  it("renders api key and endpoint inputs", () => {
    renderWithRouter(<Settings />);
    expect(screen.getByText("API Key")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("https://ark.cn-beijing.volces.com/api/v3/images/generations")).toBeInTheDocument();
  });
});

