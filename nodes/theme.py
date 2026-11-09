from __future__ import annotations

from comfy_api.latest import io

CATEGORY_THEME = "EasyUse/Theme"

# Keep in sync with THEMES in frontend/src/lib/workflow-theme.ts.
THEME_OPTIONS = ["ComfyUI default", "Slate", "Midnight", "Paper"]


class EasyWorkflowTheme(io.ComfyNode):
    """Purely cosmetic: read by the frontend only, has no effect on execution."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="easy workflowTheme",
            display_name="Workflow Theme",
            category=CATEGORY_THEME,
            description=(
                "Pick a visual theme for this workflow's EasyMedia nodes and canvas. "
                "Purely cosmetic, read by the frontend only -- has no effect on execution. "
                "Workflows without this node keep the default ComfyUI look."
            ),
            inputs=[
                io.Combo.Input("theme", options=THEME_OPTIONS, default="ComfyUI default"),
            ],
            outputs=[],
            is_output_node=True,
        )

    @classmethod
    def execute(cls, theme: str) -> io.NodeOutput:
        del theme
        return io.NodeOutput()
