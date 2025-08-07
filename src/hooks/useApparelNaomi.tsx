import { v4 as uuid } from 'uuid';
import { useState } from 'react';

import { ImageEntity } from '@hautechai/sdk';

import { useSDK } from '../context';

export const useApparelNaomi = () => {
    const sdk = useSDK();

    const [items, setItems] = useState<
        {
            id: string;
            imageId?: string;
            processedImageId?: string;
            description?: string;
            category?: string;
            hasHuman?: boolean;
        }[]
    >([]);

    const resizeImage = async (image: ImageEntity) => {
        if (image.width > 1500 || image.height > 1500 || image.width % 8 !== 0 || image.height % 8 !== 0) {
            let newW = image.width;
            let newH = image.height;

            if (newW > 1500) {
                const c = 1500 / newW;
                newW = newW * c;
                newH = newH * c;
            }

            if (newH > 1500) {
                const c = 1500 / newH;
                newW = newW * c;
                newH = newH * c;
            }

            if (newW % 8 !== 0) {
                newW = Math.ceil(newW / 8) * 8;
            }
            if (newH % 8 !== 0) {
                newH = Math.ceil(newH / 8) * 8;
            }

            const resized = await sdk.operations.wait(
                await sdk.operations.run.composite.v1({
                    input: {
                        width: newW,
                        height: newH,
                        background: '#FFFFFFFF',
                        elements: [
                            {
                                imageId: image.id,
                                left: 0,
                                top: 0,
                                width: newW,
                                height: newH,
                                fit: 'cover',
                            },
                        ],
                    },
                }),
            );

            if (resized.status !== 'finished') {
                throw new Error('Resizing failed');
            }
            return resized.output.imageId;
        }
        return image.id;
    };

    const cutObject = async (params: { label: string; imageId: string }) => {
        const { label, imageId } = params;

        const image = await sdk.images.get({ id: imageId });
        if (!image) {
            throw new Error('Image not found');
        }

        const PADDING = 30;
        const imageWithPaddings = await sdk.operations.wait(
            await sdk.operations.run.composite.v1({
                input: {
                    width: image.width + PADDING * 2,
                    height: image.height + PADDING * 2,
                    background: '#FFFFFFFF',
                    elements: [
                        {
                            imageId,
                            left: PADDING,
                            top: PADDING,
                            width: image.width,
                            height: image.height,
                            fit: 'contain',
                        },
                    ],
                },
            }),
        );
        if (imageWithPaddings.status !== 'finished') {
            throw new Error('Adding paddings failed');
        }
        const imageWithPaddingsId = imageWithPaddings.output.imageId;

        const objectDetection = await sdk.operations.wait(
            await sdk.operations.run.objectDetection.v1({
                input: {
                    labels: [label],
                    imageId: imageWithPaddingsId,
                },
            }),
        );
        if (objectDetection.status !== 'finished') {
            throw new Error('Object detection failed');
        }
        const garmentBox = (objectDetection.output.data as number[][])[0];

        const sam = await sdk.operations.wait(
            await sdk.operations.run.segmentAnything.mask.v1({
                input: {
                    imageId: imageWithPaddingsId,
                    box: garmentBox,
                    maskThreshold: -1,
                },
            }),
        );
        if (sam.status !== 'finished') {
            throw new Error('Segmentation failed');
        }
        const garmentMaskId = sam.output.imageId;

        const cutImage = await sdk.operations.wait(
            await sdk.operations.run.cut.v1({
                input: {
                    imageId: imageWithPaddingsId,
                    maskImageId: garmentMaskId!,
                },
            }),
        );

        if (cutImage.status !== 'finished') {
            throw new Error('Cut image failed');
        }

        return cutImage.output.imageId;
    };

    const cutApparelOnModel = async (params: { label: string; imageId: string }) => {
        const { label, imageId } = params;

        const objectDetection = await sdk.operations.wait(
            await sdk.operations.run.objectDetection.v1({
                input: {
                    labels: [label],
                    imageId,
                },
            }),
        );
        if (objectDetection.status !== 'finished') {
            throw new Error('Object detection failed');
        }
        const garmentBox = (objectDetection.output.data as number[][])[0];

        const croppedWidth = Math.ceil(garmentBox[2] - garmentBox[0]);
        const croppedHeight = Math.ceil(garmentBox[3] - garmentBox[1]);

        const croppedImage = await sdk.operations.wait(
            await sdk.operations.run.crop.v1({
                input: {
                    imageId,
                    left: Math.floor(garmentBox[0]),
                    top: Math.floor(garmentBox[1]),
                    width: croppedWidth,
                    height: croppedHeight,
                },
            }),
        );

        if (croppedImage.status !== 'finished') {
            throw new Error('Cropping failed');
        }
        const croppedImageId = croppedImage.output.imageId;

        const sam = await sdk.operations.wait(
            await sdk.operations.run.segmentAnything.mask.v1({
                input: {
                    imageId: croppedImageId,
                    box: [0, 0, croppedWidth, croppedHeight],
                    maskThreshold: -1,
                },
            }),
        );
        if (sam.status !== 'finished') {
            throw new Error('Segmentation failed');
        }
        const garmentMaskId = sam.output.imageId;

        const cutImage = await sdk.operations.wait(
            await sdk.operations.run.cut.v1({
                input: {
                    imageId: croppedImageId,
                    maskImageId: garmentMaskId!,
                },
            }),
        );

        if (cutImage.status !== 'finished') {
            throw new Error('Cut image failed');
        }

        return cutImage.output.imageId;
    };

    const addItem = async (file: File) => {
        const id = uuid();
        setItems((a) => [...a, { id }]);

        const image = await sdk.images.createFromFile(file);
        setItems((l) =>
            l.map((a) => {
                if (a.id === id) {
                    return { ...a, imageId: image.id };
                }
                return a;
            }),
        );

        const garmentId = await resizeImage(image);

        const gpt = await sdk.operations.wait(
            await sdk.operations.run.gpt.v1({
                input: {
                    imageId: garmentId,
                    prompt: `Describe product on the photo, detect product category (e.g t-shirt, jeans, shirt, etc.) and detect if there is a human on photo. Return response in JSON format:
                    {
                       description: string,
                       productCategory: string,
                       hasHuman: boolean
                    }
                    
                    Description should contain maximum 5 words and contain only valuable information without redundant articles and words.
                    `,
                },
            }),
        );
        if (gpt.status !== 'finished') {
            throw new Error('GPT failed');
        }

        const { description, productCategory, hasHuman } = gpt.output.data as {
            description: string;
            productCategory: string;
            hasHuman: boolean;
        };

        setItems((l) =>
            l.map((a) => {
                if (a.id === id) {
                    return { ...a, description, category: productCategory, hasHuman };
                }
                return a;
            }),
        );

        let cutGarmentImageId: string;

        if (hasHuman) {
            cutGarmentImageId = await cutApparelOnModel({
                label: `the ${productCategory} cloth`,
                imageId: garmentId,
            });
        } else {
            cutGarmentImageId = await cutObject({ label: `the ${productCategory} cloth`, imageId: garmentId });
        }

        const composite = await sdk.operations.wait(
            await sdk.operations.run.composite.v1({
                input: {
                    width: 832,
                    height: 1200,
                    background: '#FFFFFFFF',
                    elements: [
                        {
                            imageId: cutGarmentImageId,
                            left: 30,
                            top: 30,
                            width: 772,
                            height: 1140,
                            fit: 'contain',
                        },
                    ],
                },
            }),
        );

        if (composite.status !== 'finished') {
            throw new Error('Composite failed');
        }

        setItems((l) =>
            l.map((a) => {
                if (a.id === id) {
                    return { ...a, processedImageId: composite.output.imageId };
                }
                return a;
            }),
        );
    };

    const removeItem = (id: string) => {
        setItems((a) => a.filter((x) => x.id !== id));
    };

    return { items, setItems, addItem, removeItem };
};
