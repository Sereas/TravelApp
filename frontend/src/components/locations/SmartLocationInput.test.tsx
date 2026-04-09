/// <reference types="vitest/globals" />
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SmartLocationInput } from "./SmartLocationInput";

describe("SmartLocationInput", () => {
  const tripId = "trip-1";
  const onSubmit = vi.fn();
  const onImported = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Rendering ---

  it("renders an always-visible input bar", () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    expect(
      screen.getByPlaceholderText(
        /add a location.*paste a google maps link or type a name/i
      )
    ).toBeInTheDocument();
  });

  it("renders the Import Google List secondary action", () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    expect(
      screen.getByRole("button", { name: /import google list/i })
    ).toBeInTheDocument();
  });

  // --- Enter key behaviour ---

  it("calls onSubmit with the value and isUrl=false when Enter is pressed with a plain name", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Eiffel Tower{Enter}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("Eiffel Tower", false);
  });

  it("calls onSubmit with isUrl=true when input contains a Google Maps short URL", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("textbox");
    await userEvent.type(
      input,
      "https://maps.app.goo.gl/HFaERRSAPvPePT1D6{Enter}"
    );

    expect(onSubmit).toHaveBeenCalledWith(
      "https://maps.app.goo.gl/HFaERRSAPvPePT1D6",
      true
    );
  });

  it("calls onSubmit with isUrl=true when input contains a maps.google.com URL", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "https://maps.google.com/?q=louvre{Enter}");

    expect(onSubmit).toHaveBeenCalledWith(
      "https://maps.google.com/?q=louvre",
      true
    );
  });

  it("calls onSubmit with isUrl=true when input contains a google.com/maps URL", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("textbox");
    await userEvent.type(
      input,
      "https://www.google.com/maps/place/Eiffel+Tower{Enter}"
    );

    expect(onSubmit).toHaveBeenCalledWith(
      "https://www.google.com/maps/place/Eiffel+Tower",
      true
    );
  });

  it("does not call onSubmit when Enter is pressed with an empty input", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("textbox");
    await userEvent.click(input);
    await userEvent.keyboard("{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not call onSubmit when Enter is pressed with whitespace-only input", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "   {Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  // --- Input clearing ---

  it("clears the input after calling onSubmit", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "Louvre{Enter}");

    expect(input.value).toBe("");
  });

  it("does not clear the input when Enter is pressed with empty value", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.click(input);
    await userEvent.keyboard("{Enter}");

    // stays empty — but importantly stays focused and does not error
    expect(input.value).toBe("");
  });

  // --- URL detection edge cases ---

  it("treats a plain URL that is not Google Maps as isUrl=false", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "https://www.tripadvisor.com/place{Enter}");

    expect(onSubmit).toHaveBeenCalledWith(
      "https://www.tripadvisor.com/place",
      false
    );
  });

  // --- Submit button ---

  it("shows a submit button when input has text", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    // No button when empty
    expect(
      screen.queryByRole("button", { name: /add location/i })
    ).not.toBeInTheDocument();

    await userEvent.type(screen.getByRole("textbox"), "Louvre");
    expect(
      screen.getByRole("button", { name: /add location/i })
    ).toBeInTheDocument();
  });

  it("calls onSubmit when submit button is clicked", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    await userEvent.type(screen.getByRole("textbox"), "Louvre");
    await userEvent.click(
      screen.getByRole("button", { name: /add location/i })
    );

    expect(onSubmit).toHaveBeenCalledWith("Louvre", false);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
  });

  it("hides the submit button after successful submit via click", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    await userEvent.type(screen.getByRole("textbox"), "Louvre");
    await userEvent.click(
      screen.getByRole("button", { name: /add location/i })
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /add location/i })
      ).not.toBeInTheDocument();
    });
  });

  it("trims leading/trailing whitespace before passing value to onSubmit", async () => {
    render(
      <SmartLocationInput
        tripId={tripId}
        onSubmit={onSubmit}
        onImported={onImported}
      />
    );
    const input = screen.getByRole("textbox");
    // userEvent.type does not support leading spaces naturally — type with surrounding text
    await userEvent.type(input, "  Arc de Triomphe  {Enter}");

    // The submitted value should be trimmed
    expect(onSubmit).toHaveBeenCalledWith("Arc de Triomphe", false);
  });
});
