/// <reference types="vitest/globals" />
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhotoUploadDialog } from "./PhotoUploadDialog";

function createMockFile(
  name = "photo.jpg",
  type = "image/jpeg",
  size = 1024
): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  currentImageUrl: null,
  hasUserOverride: false,
  onUpload: vi.fn().mockResolvedValue(undefined),
  onReset: vi.fn().mockResolvedValue(undefined),
};

describe("PhotoUploadDialog", () => {
  it("renders drop zone when open", () => {
    render(<PhotoUploadDialog {...defaultProps} />);
    expect(screen.getByTestId("drop-zone")).toBeInTheDocument();
    expect(screen.getByText(/drop an image here/i)).toBeInTheDocument();
  });

  it("shows file preview after selection", async () => {
    const user = userEvent.setup();
    render(<PhotoUploadDialog {...defaultProps} />);

    const file = createMockFile();
    const input = screen.getByTestId("file-input");
    await user.upload(input, file);

    // Save button should be enabled when file is selected
    const saveButton = screen.getByRole("button", { name: /save/i });
    expect(saveButton).not.toBeDisabled();
  });

  it("calls onUpload when Save is clicked", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PhotoUploadDialog {...defaultProps} onUpload={onUpload} />);

    const file = createMockFile();
    const input = screen.getByTestId("file-input");
    await user.upload(input, file);

    const saveButton = screen.getByRole("button", { name: /save/i });
    await user.click(saveButton);

    // resizeImage passes through small files that fail to load in jsdom
    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledTimes(1);
    });
  });

  it("does not show Reset button when hasUserOverride is false", () => {
    render(<PhotoUploadDialog {...defaultProps} hasUserOverride={false} />);
    expect(
      screen.queryByRole("button", { name: /reset to google photo/i })
    ).not.toBeInTheDocument();
  });

  it("shows Reset button when hasUserOverride is true", () => {
    render(<PhotoUploadDialog {...defaultProps} hasUserOverride={true} />);
    expect(
      screen.getByRole("button", { name: /reset to google photo/i })
    ).toBeInTheDocument();
  });

  it("calls onReset when Reset button is clicked", async () => {
    const onReset = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <PhotoUploadDialog
        {...defaultProps}
        hasUserOverride={true}
        onReset={onReset}
      />
    );

    const resetButton = screen.getByRole("button", {
      name: /reset to google photo/i,
    });
    await user.click(resetButton);

    expect(onReset).toHaveBeenCalled();
  });

  it("shows current image when provided", () => {
    render(
      <PhotoUploadDialog
        {...defaultProps}
        currentImageUrl="https://example.com/photo.jpg"
      />
    );
    const img = screen.getByAltText("Location photo preview");
    expect(img).toHaveAttribute("src", "https://example.com/photo.jpg");
  });

  it("shows error for invalid file type via drop", async () => {
    render(<PhotoUploadDialog {...defaultProps} />);

    const file = new File(["fake"], "doc.pdf", { type: "application/pdf" });
    const dropZone = screen.getByTestId("drop-zone");

    const dataTransfer = {
      files: [file],
      items: [{ kind: "file", type: file.type, getAsFile: () => file }],
      types: ["Files"],
    };

    await waitFor(() => {
      dropZone.dispatchEvent(
        new Event("dragover", { bubbles: true, cancelable: true })
      );
    });

    // Fire drop event
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
    dropZone.dispatchEvent(dropEvent);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /only jpeg, png, and webp/i
      );
    });
  });
});
