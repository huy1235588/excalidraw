import React from 'react';
import ReactDOM from "react-dom";

import './index.css';
// import { App } from './App';
import reportWebVitals from './reportWebVitals';
import rough from "roughjs/bin/rough";
import { RoughCanvas } from "roughjs/bin/canvas";

type ExcaliburElement = ReturnType<typeof newElement>;
type ExcaliburTextElement = ExcaliburElement & {
    type: "text";
    font: string;
    text: string;
    measure: TextMetrics;
};

var elements = Array.of<ExcaliburElement>();

function isInsideAnElement(x: number, y: number) {
    return (element: ExcaliburElement) => {
        const x1 = getElementAbsoluteX1(element);
        const x2 = getElementAbsoluteX2(element);
        const y1 = getElementAbsoluteY1(element);
        const y2 = getElementAbsoluteY2(element);

        return x >= x1 && x <= x2 && y >= y1 && y <= y2;
    };
}

function newElement(
    type: string,
    x: number,
    y: number,
    width = 0,
    height = 0
) {
    const element = {
        type: type,
        x: x,
        y: y,
        width: width,
        height: height,
        isSelected: false,
        draw(rc: RoughCanvas, context: CanvasRenderingContext2D) { }
    };
    return element;
}

function exportAsPNG({
    exportBackground,
    exportVisibleOnly,
    exportPadding = 10
}: {
    exportBackground: boolean;
    exportVisibleOnly: boolean;
    exportPadding?: number;
}) {
    if (!elements.length) {
        return window.alert("Cannot export empty canvas.");
    }
    // deselect & rerender
    clearSelection();
    drawScene();

    // calculate visible-area coords
    let subCanvasX1 = Infinity;
    let subCanvasX2 = 0;
    let subCanvasY1 = Infinity;
    let subCanvasY2 = 0;

    elements.forEach(element => {
        subCanvasX1 = Math.min(subCanvasX1, getElementAbsoluteX1(element));
        subCanvasX2 = Math.max(subCanvasX2, getElementAbsoluteX2(element));
        subCanvasY1 = Math.min(subCanvasY1, getElementAbsoluteY1(element));
        subCanvasY2 = Math.max(subCanvasY2, getElementAbsoluteY2(element));
    })

    // create temporary canvas from which we'll export
    const tempCanvas = document.createElement("canvas");
    const tempCanvasCtx = tempCanvas.getContext("2d")!;
    tempCanvas.style.display = "none";
    document.body.appendChild(tempCanvas);
    tempCanvas.width = exportVisibleOnly
        ? subCanvasX2 - subCanvasX1 + exportPadding * 2
        : canvas.width;
    tempCanvas.height = exportVisibleOnly
        ? subCanvasY2 - subCanvasY1 + exportPadding * 2
        : canvas.height;

    if (exportBackground) {
        tempCanvasCtx.fillStyle = "#FFF";
        tempCanvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // copy our original canvas onto the temp canvas
    tempCanvasCtx.drawImage(
        canvas, // source
        exportVisibleOnly // sx
            ? subCanvasX1 - exportPadding
            : 0,
        exportVisibleOnly // sy
            ? subCanvasY1 - exportPadding
            : 0,
        exportVisibleOnly
            ? subCanvasX2 - exportPadding
            : canvas.width,
        exportVisibleOnly
            ? subCanvasY2 - exportPadding
            : canvas.height,
        0, //dx
        0, //dy
        exportVisibleOnly ? tempCanvas.width : canvas.width, // dwidth
        exportVisibleOnly ? tempCanvas.height : canvas.height // dheight
    );

    // create a temporary <a> elem which we'll use to download the image
    const link = document.createElement("a");
    link.setAttribute("download", "excalibur.png");
    link.setAttribute("href", tempCanvas.toDataURL("img/png"));
    link.click();

    // clean up the DOM
    link.remove();
    if (tempCanvas !== canvas) {
        tempCanvas.remove();
    }
}

function rotate(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    angle: number
) {
    // 𝑎′𝑥=(𝑎𝑥−𝑐𝑥)cos𝜃−(𝑎𝑦−𝑐𝑦)sin𝜃+𝑐𝑥
    // 𝑎′𝑦=(𝑎𝑥−𝑐𝑥)sin𝜃+(𝑎𝑦−𝑐𝑦)cos𝜃+𝑐𝑦.
    // https://math.stackexchange.com/questions/2204520/how-do-i-rotate-a-line-segment-in-a-specific-point-on-the-line

    return [
        (x1 - x2) * Math.cos(angle) - (y1 - y2) * Math.sin(angle) + x2,
        (x1 - x2) * Math.sin(angle) + (y1 - y2) * Math.cos(angle) + y2
    ];

}

// Casting second argument (DrawingSurface) to any,
// because it is required by TS definitions and not required at runtime
var generator = rough.generator(null as any);

function isTextElement(
    element: ExcaliburElement
): element is ExcaliburTextElement {
    return element.type === "text";
}

function generateDraw(element: ExcaliburElement) {
    if (element.type === "selection") {
        element.draw = (rc, context) => {
            const fillStyle = context.fillStyle;
            context.fillStyle = "rgba(0, 0, 255, 0.10)";
            context.fillRect(element.x, element.y, element.width, element.height);
            context.fillStyle = fillStyle;
        };
    }
    else if (element.type === "rectangle") {
        const shape = generator.rectangle(0, 0, element.width, element.height);
        element.draw = (rc, context) => {
            context.translate(element.x, element.y);
            rc.draw(shape);
            context.translate(-element.x, -element.y);
        };
    }
    else if (element.type === "ellipse") {
        const shape = generator.ellipse(
            element.width / 2,
            element.height / 2,
            element.width,
            element.height
        );
        element.draw = (rc, context) => {
            context.translate(element.x, element.y);
            rc.draw(shape);
            context.translate(-element.x, -element.y);
        };
    }
    else if (element.type === "arrow") {
        const x1 = 0;
        const y1 = 0;
        const x2 = element.width;
        const y2 = element.height;

        const size = 30; // pixels
        const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        // Scale down the arrow until we hit a certain size so that it doesn't look weird
        const minSize = Math.min(size, distance / 2);
        const xs = x2 - ((x2 - x1) / distance) * minSize;
        const ys = y2 - ((y2 - y1) / distance) * minSize;

        const angle = 20; //degrees
        const [x3, y3] = rotate(xs, ys, x2, y2, (-angle * Math.PI) / 180);
        const [x4, y4] = rotate(xs, ys, x2, y2, (angle * Math.PI) / 180);

        const shapes = [
            //    \
            generator.line(x3, y3, x2, y2),
            // -----
            generator.line(x1, y1, x2, y2),
            //    /
            generator.line(x4, y4, x2, y2)
        ];

        element.draw = (rc, context) => {
            context.translate(element.x, element.y);
            shapes.forEach(shape => rc.draw(shape));
            context.translate(-element.x, -element.y);
        };
        return;
    }
    else if (isTextElement(element)) {
        element.draw = (rc, context) => {
            const font = context.font;
            context.font = element.font;
            context.fillText(
                element.text,
                element.x,
                element.y + element.measure.actualBoundingBoxAscent
            );
            context.font = font;
        };
    }
    else {
        throw new Error("Unimplemented type " + element.type);
    }
}

// If the element is created from right to left, the width is going to be negative
// This set of functions retrieves the absolute position of the 4 points.
// We can't just always normalize it since we need to remember the fact that an arrow
// is pointing left or right.
function getElementAbsoluteX1(element: ExcaliburElement) {
    return element.width >= 0 ? element.x : element.x + element.width;
}

function getElementAbsoluteX2(element: ExcaliburElement) {
    return element.width >= 0 ? element.x + element.width : element.x;
}

function getElementAbsoluteY1(element: ExcaliburElement) {
    return element.height >= 0 ? element.y : element.y + element.height;
}

function getElementAbsoluteY2(element: ExcaliburElement) {
    return element.height >= 0 ? element.y + element.height : element.y;
}

function setSelection(selection: ExcaliburElement) {
    const selectionX1 = getElementAbsoluteX1(selection);
    const selectionX2 = getElementAbsoluteX2(selection);
    const selectionY1 = getElementAbsoluteY1(selection);
    const selectionY2 = getElementAbsoluteY2(selection);

    elements.forEach(element => {
        const elementX1 = getElementAbsoluteX1(element);
        const elementX2 = getElementAbsoluteX2(element);
        const elementY1 = getElementAbsoluteY1(element);
        const elementY2 = getElementAbsoluteY2(element);

        element.isSelected =
            element.type !== "selection" &&
            selectionX1 <= elementX1 &&
            selectionY1 <= elementY1 &&
            selectionX2 >= elementX2 &&
            selectionY2 >= elementY2;
    });
}

function clearSelection() {
    elements.forEach(element => {
        element.isSelected = false;
    });
}

type AppState = {
    draggingElement: ExcaliburElement | null;
    elementType: string;
    exportBackground: boolean;
    exportVisibleOnly: boolean;
    exportPadding: number;
}

class App extends React.Component<{}, AppState> {
    public componentDidMount() {
        document.addEventListener("keydown", this.onKeyDown, false);
    }

    public componentWillUnmount() {
        document.removeEventListener("keydown", this.onKeyDown, false);
    }

    public state: AppState = {
        draggingElement: null,
        elementType: "selection",
        exportBackground: false,
        exportVisibleOnly: true,
        exportPadding: 10
    };

    private onKeyDown = (event: KeyboardEvent) => {
        if (
            event.key === 'Delete' &&
            (event.target as HTMLElement)?.nodeName !== "INPUT"
        ) {
            for (var i = elements.length - 1; i >= 0; --i) {
                if (elements[i].isSelected) {
                    elements.slice(i, 1);
                }
            }
            drawScene();
            event.preventDefault();
        }
        else if (
            event.key === "ArrowLeft" ||
            event.key === "ArrowRight" ||
            event.key === "ArrowUp" ||
            event.key === "ArrowDown"
        ) {
            const step = event.shiftKey ? 5 : 1;
            elements.forEach(element => {
                if (element.isSelected) {
                    if (event.key === "ArrowLeft") element.x -= step;
                    else if (event.key === "ArrowRight") element.x += step;
                    else if (event.key === "ArrowUp") element.y -= step;
                    else if (event.key === "ArrowDown") element.y += step;
                }
            });
            drawScene();
            event.preventDefault();
        }
    };

    private renderOption({
        type,
        children
    }: {
        type: string;
        children: React.ReactNode;
    }) {
        return (
            <label >
                <input
                    type="radio"
                    checked={this.state.elementType === type}
                    onChange={() => {
                        this.setState({ elementType: type });
                        clearSelection();
                        drawScene();
                    }}
                />
                {children}
            </label>
        );
    }

    public render() {
        return (
            <>
                <div className='exportWrapper'>
                    <button
                        onClick={() => {
                            exportAsPNG({
                                exportBackground: this.state.exportBackground,
                                exportVisibleOnly: this.state.exportVisibleOnly,
                                exportPadding: this.state.exportPadding
                            });
                        }}
                    >
                        Export to png
                    </button>
                    <label>
                        <input
                            type="checkbox"
                            checked={this.state.exportBackground}
                            onChange={e => {
                                this.setState({ exportBackground: e.target.checked });
                            }}
                        />{" "}
                        background
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={this.state.exportVisibleOnly}
                            onChange={e => {
                                this.setState({ exportVisibleOnly: e.target.checked })
                            }}
                        />
                        visible area only
                    </label>
                    (padding:
                    <input
                        type="number"
                        value={this.state.exportPadding}
                        onChange={e => {
                            this.setState({ exportPadding: Number(e.target.value) })
                        }}
                        disabled={!this.state.exportVisibleOnly}
                    />
                    px)
                </div>
                <div>
                    {this.renderOption({ type: "rectangle", children: "Rectangle" })}
                    {this.renderOption({ type: "ellipse", children: "Ellipse" })}
                    {this.renderOption({ type: "arrow", children: "Arrow" })}
                    {this.renderOption({ type: "text", children: "Text" })}
                    {this.renderOption({ type: "selection", children: "Selection" })}

                    <canvas
                        id='canvas'
                        width={window.innerWidth}
                        height={window.innerHeight}
                        onMouseDown={e => {
                            const x = e.clientX - (e.target as HTMLElement).offsetLeft;
                            const y = e.clientY - (e.target as HTMLElement).offsetTop;
                            const element = newElement(this.state.elementType, x, y);

                            let isDraggingElements = false;
                            const cursorStyle = document.documentElement.style.cursor;

                            if (this.state.elementType === "selection") {
                                const selectedElement = elements.find(element => {
                                    const isSelected = isInsideAnElement(x, y)(element);
                                    if (isSelected) {
                                        element.isSelected = true;
                                    }
                                    return isSelected;
                                });

                                if (selectedElement) {
                                    this.setState({ draggingElement: selectedElement });
                                }
                                else {
                                    clearSelection();
                                }

                                isDraggingElements = elements.some(
                                    element => element.isSelected
                                );

                                if (isDraggingElements) {
                                    document.documentElement.style.cursor = "move";
                                }
                            }

                            if (isTextElement(element)) {
                                const text = prompt("What text do you want, bruh?");
                                if (text === null) {
                                    return;
                                }
                                element.text = text;
                                element.font = "20px Virgil";
                                const font = context.font;
                                context.font = element.font;
                                element.measure = context.measureText(element.text);
                                context.font = font;
                                const height =
                                    element.measure.actualBoundingBoxAscent +
                                    element.measure.actualBoundingBoxDescent;
                                // Center the text
                                element.x -= element.measure.width / 2;
                                element.y -= element.measure.actualBoundingBoxAscent;
                                element.width = element.measure.width;
                                element.height = height;
                            }

                            generateDraw(element);
                            elements.push(element);
                            if (this.state.elementType === "text") {
                                this.setState({
                                    draggingElement: null,
                                    elementType: "selection"
                                });
                                element.isSelected = true;
                            }
                            else {
                                this.setState({ draggingElement: element });
                            }

                            let lastX = x;
                            let lastY = y;

                            const onMouseMove = (e: MouseEvent) => {
                                const target = e.target;
                                if (!(target instanceof HTMLElement)) {
                                    return;
                                }

                                if (!isDraggingElements) {
                                    const selectedElements = elements.filter(el => el.isSelected);
                                    if (selectedElements.length) {
                                        const x = e.clientX - target.offsetHeight;
                                        const y = e.clientY - target.offsetTop;
                                        selectedElements.forEach(element => {
                                            element.x += x - lastX;
                                            element.y += y - lastY;
                                        });
                                        lastX = x;
                                        lastY = y;
                                        drawScene();
                                        return;
                                    }
                                };

                                // It is very important to read this.state within each move event,
                                // otherwise we would read a stale one!
                                const draggingElement = this.state.draggingElement;
                                if (!draggingElement) {
                                    return;
                                }
                                let width = e.clientX - target.offsetLeft - draggingElement.x;
                                let height = e.clientY - target.offsetTop - draggingElement.y;
                                draggingElement.width = width;
                                // Make a perfect square or circle when shift is enabled
                                draggingElement.height = e.shiftKey ? width : height;

                                generateDraw(draggingElement);

                                if (this.state.elementType === "selection") {
                                    setSelection(draggingElement);
                                }
                                drawScene();
                            };

                            const onMouseUp = (e: MouseEvent) => {
                                const { draggingElement, elementType } = this.state;

                                window.removeEventListener("mousemove", onMouseMove);
                                window.removeEventListener("mouseup", onMouseUp);

                                document.documentElement.style.cursor = cursorStyle;

                                // if no element is clicked, clear the selection and redraw
                                if (draggingElement === null) {
                                    clearSelection();
                                    drawScene();
                                    return;
                                }

                                if (elementType === "selection") {
                                    if (isDraggingElements) {
                                        isDraggingElements = false;
                                    }
                                    elements.pop();
                                }
                                else {
                                    draggingElement.isSelected = true;
                                }
                                this.setState({
                                    draggingElement: null,
                                    elementType: "selection"
                                });
                                drawScene();
                            };

                            window.addEventListener("mousemove", onMouseMove);
                            window.addEventListener("mouseup", onMouseUp);

                            drawScene();
                        }}
                    />
                </div>
            </>
        );
    }
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const rc = rough.canvas(canvas);
const context = canvas.getContext("2d")!;

// Big hack to ensure that all the 1px lines are drawn at 1px instead of 2px
// https://stackoverflow.com/questions/13879322/drawing-a-1px-thick-line-in-canvas-creates-a-2px-thick-line/13879402#comment90766599_13879402
context.translate(0.5, 0.5);

function drawScene() {
    ReactDOM.render(<App />, rootElement);

    context.clearRect(-0.5, -0.5, canvas.width, canvas.height);

    elements.forEach(element => {
        element.draw(rc, context);
        if (element.isSelected) {
            const margin = 4;

            const elementX1 = getElementAbsoluteX1(element);
            const elementX2 = getElementAbsoluteX2(element);
            const elementY1 = getElementAbsoluteY1(element);
            const elementY2 = getElementAbsoluteY2(element);
            const lineDash = context.getLineDash();
            context.setLineDash([8, 4]);
            context.strokeRect(
                elementX1 - margin,
                elementY1 - margin,
                elementX2 - elementX1 + margin * 2,
                elementY2 - elementY1 + margin * 2
            );
            context.setLineDash(lineDash);
        }
    });
}

drawScene();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
