import { v4 as uuid } from 'uuid';
import { useState } from 'react';

import { ImageEntity } from '@hautechai/sdk';

import { useSDK } from '../context';

export const useApparelLinda = () => {
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

    const addItem = async (file: File) => {
        const id = uuid();
        setItems((a) => [...a, { id }]);

        const image = await sdk.images.createFromFile({ file });
        // setItems((l) =>
        //     l.map((a) => {
        //         if (a.id === id) {
        //             return { ...a, imageId: image.id };
        //         }
        //         return a;
        //     }),
        // );

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
                    return {
                        ...a,
                        imageId: garmentId,
                        description,
                        category: productCategory,
                        hasHuman,
                    };
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
