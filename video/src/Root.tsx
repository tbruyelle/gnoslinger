import React from "react";
import { Composition } from "remotion";
import { FPS, HEIGHT, WIDTH, totalFrames } from "./scenes";
import { Video } from "./Video";

export const Root: React.FC = () => <Composition id="Gnoslinger" component={Video} durationInFrames={totalFrames()} fps={FPS} width={WIDTH} height={HEIGHT} />;
