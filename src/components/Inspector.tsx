import {
  faBan,
  faCaretDown,
  faDownload,
  faFileArrowUp,
  faFileCirclePlus,
  faFileCode,
  faFileImage,
  faFilePen,
  faSave,
  faTrash,
  faUpload,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  styled,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import produce from "immer";
import _ from "lodash";
import { useConfirm } from "material-ui-confirm";
import React, { useCallback, useEffect, useState } from "react";
import * as cytoModel from "../model/cytoWrapper";
import { isAtom, isScheme } from "../model/node";
import * as convert from "../services/convert";
import { cyto2aif, cyto2protobuf, proto2json } from "../services/convert";
import * as date from "../services/date";
import demoGraph from "../services/demo";
import { useGraph } from "./GraphContext";

const NULL_VALUE = "###NULL###";

function generateFilename() {
  return date.format(date.now(), "yyyy-MM-dd-HH-mm-ss");
}

// https://stackoverflow.com/a/55613750/7626878
async function downloadJson(data: any) {
  const json = JSON.stringify(data);
  const blob = new Blob([json], { type: "application/json" });
  downloadBlob(blob, ".json");
}

async function downloadBlob(data: Blob, suffix: string) {
  const href = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = href;
  link.download = generateFilename() + suffix;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const Input = styled("input")({
  display: "none",
});

type ElementType = "graph" | "atom" | "scheme" | "edge" | "null";

function Inspector() {
  const { cy, updateGraph, exportState, resetGraph, clearCache } = useGraph();
  const [element, setElement] = useState(cy?.data());
  const [modifiedAttributes, setModifiedAttributes] = useState<
    Array<string | string[]>
  >([]);
  const confirm = useConfirm();
  const theme = useTheme();

  const elementType: () => ElementType = useCallback(() => {
    if (element && isScheme(element)) {
      return "scheme";
    } else if (element && isAtom(element)) {
      return "atom";
    } else if (element && element.source && element.target) {
      return "edge";
    } else if (element) {
      return "graph";
    } else {
      return "null";
    }
  }, [element]);

  useEffect(() => {
    if (cy) {
      setElement(cy.data());

      cy.on("select", (e) => {
        setModifiedAttributes([]);
        if (cy.$(":selected").length === 1) {
          setElement(e.target.data());
        } else {
          setElement(null);
        }
      });
      cy.on("unselect", () => {
        if (cy.$(":selected").length === 0) {
          setModifiedAttributes([]);
          setElement(cy.data());
        }
      });
      cy.on("remove", () => {
        cy.elements().selectify();
        cy.elements().unselect();
        setModifiedAttributes([]);
        setElement(cy.data());
      });
    }
  }, [cy]);

  const handleChange = useCallback(
    (attr: string | string[]) => {
      // We need to return a function here, thus the nested callbacks
      return (
        event:
          | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
          | React.ChangeEvent<{
              name?: string;
              value: any;
              event: Event | React.SyntheticEvent<Element, Event>;
            }>
          | SelectChangeEvent<HTMLInputElement | string>
      ) => {
        setModifiedAttributes((previous) => [...previous, attr]);

        if (cy) {
          // Prevent the user from selecting another element.
          // Otherwise, the local changes would be lost.
          cy.elements().unselectify();

          // Update our interim element
          setElement(
            produce((draft: any) => {
              _.set(draft, attr, event.target.value);
            })
          );
        }
      };
    },
    [cy]
  );

  let fields = null;

  if (elementType() === "scheme") {
    fields = (
      <>
        <FormControl fullWidth>
          <InputLabel>Scheme Type</InputLabel>
          <Select
            value={element.type}
            label="Scheme Type"
            onChange={handleChange("type")}
            defaultValue={NULL_VALUE}
          >
            <MenuItem value={NULL_VALUE}>Unknown</MenuItem>
            {Object.entries(cytoModel.node.SchemeType).map(([key, value]) => (
              <MenuItem key={key} value={value}>
                {value}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>Argumentation Scheme</InputLabel>
          <Select
            value={element.argumentationScheme}
            label="Argumentation Scheme"
            onChange={handleChange("argumentationScheme")}
            defaultValue={NULL_VALUE}
          >
            <MenuItem value={NULL_VALUE}>Unknown</MenuItem>
            {Object.entries(cytoModel.node.Scheme).map(([key, value]) => {
              return (
                <MenuItem key={key} value={value}>
                  {value}
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
      </>
    );
  } else if (elementType() === "atom") {
    fields = (
      <>
        <TextField
          fullWidth
          multiline
          minRows={3}
          label="Text"
          value={element.text}
          onChange={handleChange("text")}
        />
        <TextField
          fullWidth
          multiline
          minRows={3}
          label="Original Text"
          value={element.reference?.text}
          onChange={handleChange(["reference", "text"])}
        />
      </>
    );
  } else if (elementType() === "graph") {
    fields = (
      <>
        <div>
          <Accordion defaultExpanded>
            <AccordionSummary
              expandIcon={<FontAwesomeIcon icon={faCaretDown} />}
            >
              <Typography variant="h6">
                <FontAwesomeIcon icon={faUpload} />
                &nbsp;Import
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                <label htmlFor="upload-file-button">
                  <Input
                    accept="text/json"
                    id="upload-file-button"
                    type="file"
                    // Reset the value after every upload so that the user can upload the same file twice.
                    // https://stackoverflow.com/a/40429197
                    onClick={(event) => {
                      (event.target as HTMLInputElement).value = "";
                    }}
                    // TODO: Properly handle the else branches of the conditions
                    onChange={(event) => {
                      if (event.target.files && event.target.files.length > 0) {
                        // https://stackoverflow.com/a/30992506
                        var reader = new FileReader();
                        reader.onload = (e) => {
                          if (e.target && typeof e.target.result === "string") {
                            const parsedGraph = JSON.parse(e.target.result);
                            confirm().then(() =>
                              resetGraph(convert.importGraph(parsedGraph))
                            );
                          }
                        };

                        reader.readAsText(event.target.files[0]);
                      }
                    }}
                  />
                  <Button
                    startIcon={<FontAwesomeIcon icon={faFileArrowUp} />}
                    variant="contained"
                    component="span"
                    fullWidth
                  >
                    Upload
                  </Button>
                </label>
                <Button
                  startIcon={<FontAwesomeIcon icon={faFileCirclePlus} />}
                  variant="contained"
                  onClick={() => {
                    confirm().then(() => resetGraph(cytoModel.init()));
                  }}
                >
                  Load Empty
                </Button>
                <Button
                  startIcon={<FontAwesomeIcon icon={faFilePen} />}
                  variant="contained"
                  onClick={() => {
                    confirm().then(() => resetGraph(demoGraph()));
                  }}
                >
                  Load Demo
                </Button>
              </Stack>
            </AccordionDetails>
          </Accordion>
          <Accordion defaultExpanded>
            <AccordionSummary
              expandIcon={<FontAwesomeIcon icon={faCaretDown} />}
            >
              <Typography variant="h6">
                <FontAwesomeIcon icon={faDownload} />
                &nbsp;Export
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                <Button
                  startIcon={<FontAwesomeIcon icon={faFileCode} />}
                  variant="contained"
                  onClick={() => {
                    downloadJson(proto2json(cyto2protobuf(exportState())));
                  }}
                >
                  Arguebuf
                </Button>
                <Button
                  startIcon={<FontAwesomeIcon icon={faFileCode} />}
                  variant="contained"
                  onClick={() => {
                    downloadJson(cyto2aif(exportState()));
                  }}
                >
                  AIF
                </Button>
                <Button
                  startIcon={<FontAwesomeIcon icon={faFileImage} />}
                  variant="contained"
                  onClick={() => {
                    if (cy) {
                      downloadBlob(
                        cy.png({ output: "blob", scale: 2, full: true }),
                        ".png"
                      );
                    }
                  }}
                >
                  PNG
                </Button>
                <Button
                  startIcon={<FontAwesomeIcon icon={faFileImage} />}
                  variant="contained"
                  onClick={() => {
                    if (cy) {
                      downloadBlob(
                        cy.jpg({
                          output: "blob",
                          scale: 2,
                          full: true,
                          quality: 1,
                          bg: theme.palette.background.default,
                        }),
                        ".jpg"
                      );
                    }
                  }}
                >
                  JPG
                </Button>
                {theme.palette.mode === "dark" && (
                  <Typography variant="caption">
                    <b>Please note:</b>
                    <br />
                    The rendering respects dark mode. If you want a white
                    background, please switch to light mode.
                  </Typography>
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>
        </div>
        <Tooltip
          title="If errors occur, you can clear your browser's cache and reload the page with this button"
          describeChild
        >
          <Button
            color="error"
            startIcon={<FontAwesomeIcon icon={faTrash} />}
            variant="contained"
            onClick={() => {
              confirm().then(clearCache);
            }}
          >
            Clear cache
          </Button>
        </Tooltip>
      </>
    );
  } else if (elementType() === "null") {
    fields = (
      <Stack spacing={3}>
        <Typography variant="h6">Multiple elements selected</Typography>
        <Typography variant="body1">
          Please select only one if you want to edit their values. You can still
          move multiple elements together in the canvas.
        </Typography>
      </Stack>
    );
  }

  return (
    <>
      <Toolbar>
        <Stack
          direction="row"
          justifyContent="space-between"
          width={1}
          alignItems="center"
        >
          <Typography variant="h5">Inspector</Typography>
          {elementType() !== "graph" && (
            <Tooltip describeChild title="Close inspector for current element">
              <IconButton
                onClick={() => {
                  cy?.elements().selectify();
                  cy?.elements().unselect();
                  setModifiedAttributes([]);
                }}
              >
                <FontAwesomeIcon icon={faXmark} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Toolbar>
      <Stack spacing={3} padding={3}>
        {fields}
        {modifiedAttributes.length > 0 && (
          <Stack justifyContent="space-around" direction="row" width={1}>
            <Button
              variant="contained"
              color="error"
              startIcon={<FontAwesomeIcon icon={faBan} />}
              onClick={() => {
                cy?.elements().selectify();
                cy?.elements().unselect();
                setModifiedAttributes([]);
              }}
            >
              Discard
            </Button>
            <Button
              variant="contained"
              startIcon={<FontAwesomeIcon icon={faSave} />}
              onClick={() => {
                if (element) {
                  const modifiedAttrs = new Set(modifiedAttributes);
                  // Could improve performance when avoiding deep clone
                  const elem = _.cloneDeep(element);

                  modifiedAttrs.forEach((attr) => {
                    if (_.get(elem, attr) === NULL_VALUE) {
                      _.set(elem, attr, undefined);
                    }
                  });

                  const cytoElem = cy?.$id(elem.id);
                  cytoElem?.data(elem);
                  updateGraph();
                }
                cy?.elements().selectify();
                setModifiedAttributes([]);
              }}
            >
              Save
            </Button>
          </Stack>
        )}
      </Stack>
    </>
  );
}

export default Inspector;
