/// <reference types="vitest/globals" />
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocationPopupCard } from "./LocationPopupCard";

describe("LocationPopupCard", () => {
  it("renders the location name and category badge", () => {
    render(<LocationPopupCard name="Eiffel Tower" category="Viewpoint" />);
    expect(screen.getByText("Eiffel Tower")).toBeTruthy();
    expect(screen.getByTestId("popup-category-badge")).toBeTruthy();
  });

  it("renders city when provided", () => {
    render(<LocationPopupCard name="Arc de Triomphe" city="Paris" />);
    expect(screen.getByTestId("popup-city")).toHaveTextContent("Paris");
  });

  it("shows Edit note button when onSaveNote provided and not readOnly", () => {
    render(
      <LocationPopupCard
        name="Test"
        note="existing note"
        onSaveNote={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /edit note/i })).toBeTruthy();
  });

  it("shows Delete location button when onDelete provided and not readOnly", () => {
    render(<LocationPopupCard name="Test" onDelete={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /delete location/i })
    ).toBeTruthy();
  });

  it("hides Edit note and Delete buttons in readOnly mode", () => {
    render(
      <LocationPopupCard
        name="Test"
        note="a note"
        readOnly={true}
        onSaveNote={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /edit note/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /delete location/i })
    ).toBeNull();
  });

  it("calls onSaveNote with trimmed value on save", async () => {
    const onSaveNote = vi.fn().mockResolvedValue(undefined);
    render(<LocationPopupCard name="Test" onSaveNote={onSaveNote} />);

    // Click the "Add note" button to enter edit mode
    const addNoteBtn = screen.getByRole("button", { name: /edit note/i });
    await userEvent.click(addNoteBtn);

    // Type in the textarea
    const textarea = screen.getByRole("textbox", { name: /edit note/i });
    await userEvent.type(textarea, "  my note  ");

    // Click Save
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(onSaveNote).toHaveBeenCalledWith("my note");
    });
  });

  it("calls onDelete when delete is confirmed", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<LocationPopupCard name="Test" onDelete={onDelete} />);

    // Click Delete location
    await userEvent.click(
      screen.getByRole("button", { name: /delete location/i })
    );

    // Confirmation row appears — click Confirm
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });

  it("renders text-only layout when no image_url provided", () => {
    const { container } = render(
      <LocationPopupCard name="No Image Place" category="Park" />
    );
    // No img element in the DOM
    expect(container.querySelector("img")).toBeNull();
    // Category badge still renders in the no-image path
    expect(screen.getByTestId("popup-category-badge")).toBeTruthy();
  });

  it("shows existing note text in view mode", () => {
    render(
      <LocationPopupCard name="Noted Place" note="This is an existing note" />
    );
    expect(screen.getByTestId("popup-note")).toHaveTextContent(
      "This is an existing note"
    );
  });
});
