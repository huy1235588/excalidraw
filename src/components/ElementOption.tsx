'use client'
import React from 'react';

interface ElementOptionProps {
    type: string;
    children: string;
}


const ElementOption: React.FC<ElementOptionProps> = ({
    type,
    children,
}) => {

    const [elementType, setElementType] = React.useState("selection");

    return (
        <label>
            <input
                type="radio"
                checked={elementType === type}
                onChange={() => setElementType(type)}
            />
            {children}
        </label>
    );
}

export default ElementOption;